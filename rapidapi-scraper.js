/**
 * RapidAPI Instagram Scraper Module
 *
 * Uses ig-scraper5 on RapidAPI to fetch public profile data.
 * This replaces the previous Apify implementation to save costs.
 */

const { isB2Configured, uploadProfilePic, uploadPostImage, uploadVideo } = require('./b2-storage');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'ig-scraper5.p.rapidapi.com';

// Regex patterns for fundraiser links
const FUNDRAISER_PATTERNS = [
    /gofundme\.com\/[^\s\)"]+/gi,
    /chuffed\.org\/[^\s\)"]+/gi,
    /givesendgo\.com\/[^\s\)"]+/gi,
    /justgiving\.com\/[^\s\)"]+/gi,
    /gofund\.me\/[^\s\)"]+/gi,
    /paypal\.me\/[^\s\)"]+/gi,
    /buymeacoffee\.com\/[^\s\)"]+/gi,
    /ko-fi\.com\/[^\s\)"]+/gi,
    /linktr\.ee\/[^\s\)"]+/gi,
    /bit\.ly\/[^\s\)"]+/gi,
];

/**
 * Extract fundraiser links from bio text
 */
function extractFundraiserLinks(bioText) {
    if (!bioText) return [];

    const links = [];
    for (const pattern of FUNDRAISER_PATTERNS) {
        const matches = bioText.match(pattern);
        if (matches) {
            links.push(...matches.map(m => m.startsWith('http') ? m : `https://${m}`));
        }
    }

    const urlPattern = /https?:\/\/[^\s\)"]+/gi;
    const urlMatches = bioText.match(urlPattern);
    if (urlMatches) {
        links.push(...urlMatches);
    }

    return [...new Set(links)]; 
}

/**
 * Generic fetcher for RapidAPI
 */
async function fetchFromRapidAPI(endpoint, params) {
    if (!RAPIDAPI_KEY) {
        throw new Error('RAPIDAPI_KEY is not configured in environment variables.');
    }

    const query = new URLSearchParams(params).toString();
    const url = `https://${RAPIDAPI_HOST}${endpoint}?${query}`;

    console.log(`[RapidAPI] Fetching: ${url}`);
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`RapidAPI Error ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Check if Instagram account is public using RapidAPI
 */
async function checkAccountPublic(username) {
    if (!RAPIDAPI_KEY) {
        return { isPublic: false, error: 'RAPIDAPI_KEY not configured' };
    }

    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    
    try {
        const data = await fetchFromRapidAPI('/user/details', { username: cleanUsername });
        
        // Structure varies by API, but usually details are in the root or 'data' or 'user' object
        const user = data.data || data.user || data;

        if (!user || user.is_private === undefined) {
             return { isPublic: false, error: 'Could not fetch user data. Account may not exist.' };
        }

        if (user.is_private || user.isPrivate) {
            return { isPublic: false, error: 'Account is private. Only public accounts can be scraped.' };
        }

        return { isPublic: true, profileData: user };
    } catch (err) {
        console.error('[RapidAPI] Check public error:', err);
        return { isPublic: false, error: err.message };
    }
}

/**
 * Scrape full profile data including posts
 */
async function scrapeProfile(username, postsLimit = 50) {
    if (!RAPIDAPI_KEY) {
        return { error: 'RAPIDAPI_KEY not configured' };
    }

    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
    
    try {
        // 1. Fetch User Details
        const detailsData = await fetchFromRapidAPI('/user/details', { username: cleanUsername });
        const user = detailsData.data || detailsData.user || detailsData;

        if (!user || (user.is_private && user.isPrivate)) {
             return { error: 'Account is private or does not exist.', isPrivateOrEmpty: true };
        }

        const bio = user.biography || user.bio || '';
        
        // Map the fields based on common RapidAPI JSON structures
        const profile = {
            username: user.username || cleanUsername,
            fullName: user.full_name || user.fullName || '',
            biography: bio,
            profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || '',
            followersCount: user.edge_followed_by?.count || user.follower_count || user.followers || 0,
            followingCount: user.edge_follow?.count || user.following_count || user.following || 0,
            postsCount: user.edge_owner_to_timeline_media?.count || user.media_count || user.posts || 0,
            isVerified: user.is_verified || user.isVerified || false,
            externalUrl: user.external_url || user.website || '',
            fundraiserLinks: extractFundraiserLinks(bio),
        };

        // 2. Fetch User Posts (Handling Pagination)
        let contentItems = [];
        let cursor = '';
        let hasNextPage = true;

        while (hasNextPage && contentItems.length < postsLimit) {
            const postsParams = { username: cleanUsername };
            if (cursor) postsParams.end_cursor = cursor; // The param name might vary slightly by API 

            try {
                const postsData = await fetchFromRapidAPI('/user/posts', postsParams);
                
                // Typical instagram JSON array extraction mapping
                const timeline = postsData.data?.user?.edge_owner_to_timeline_media || postsData.edges || postsData.items || postsData;
                const edges = timeline.edges || timeline;
                
                if (!Array.isArray(edges) || edges.length === 0) {
                    break; 
                }

                for (const edge of edges) {
                    if (contentItems.length >= postsLimit) break;

                    const item = edge.node || edge; 
                    const shortCode = item.shortcode || item.code;

                    if (!shortCode) continue;

                    const captionNode = item.edge_media_to_caption?.edges?.[0]?.node;
                    const caption = captionNode?.text || item.caption?.text || item.caption || '';

                    contentItems.push({
                        id: item.id || shortCode,
                        shortCode: shortCode,
                        type: item.is_video ? 'video' : 'post',
                        caption: caption,
                        displayUrl: item.display_url || item.thumbnail_src || item.image_versions2?.candidates?.[0]?.url,
                        videoUrl: item.video_url || item.video_versions?.[0]?.url,
                        likesCount: item.edge_media_preview_like?.count || item.like_count || item.likes || 0,
                        commentsCount: item.edge_media_to_comment?.count || item.comment_count || item.comments || 0,
                        timestamp: item.taken_at_timestamp || item.taken_at || Math.floor(Date.now() / 1000),
                        locationName: item.location?.name || '',
                        hashtags: caption.match(/#[^\s#]+/g) || [],
                        mentions: caption.match(/@[^\s@]+/g) || [],
                        isVideo: !!item.is_video || !!item.video_url,
                    });
                }

                // Setup next pagination
                const pageInfo = timeline.page_info || timeline.paging;
                hasNextPage = pageInfo?.has_next_page || !!pageInfo?.next_max_id;
                cursor = pageInfo?.end_cursor || pageInfo?.next_max_id || '';

            } catch (postErr) {
                console.warn(`[RapidAPI] Failed to fetch posts page: ${postErr.message}`);
                break; // Stop fetching if pagination fails but return what we got so far
            }
        }

        console.log(`[RapidAPI] Parsed ${contentItems.length} content items for @${cleanUsername}`);

        return {
            success: true,
            profile: profile,
            content: contentItems,
            scrapedAt: new Date().toISOString(),
        };

    } catch (err) {
        console.error('[RapidAPI] Scrape error:', err);
        return { error: err.message };
    }
}

/**
 * Check cooldown for a family (2 minutes for testing, change to 24 hours for production)
 */
async function checkScrapeCooldown(supabase, familyId) {
    const COOLDOWN_MINUTES = 2; // For testing. Change to 1440 (24 hrs) for prod

    console.log(`[RapidAPI] Checking cooldown for family ${familyId}`);

    const { data, error } = await supabase
        .from('mothers_profiles')
        .select('last_scraped_at')
        .eq('family_id', familyId)
        .single();

    if (error && error.code !== 'PGRST116') {
        return { canScrape: false, error: error.message };
    }

    if (!data || !data.last_scraped_at) {
        return { canScrape: true };
    }

    const lastScraped = new Date(data.last_scraped_at);
    const minutesSince = (Date.now() - lastScraped.getTime()) / (1000 * 60);

    if (minutesSince < COOLDOWN_MINUTES) {
        const minutesRemaining = Math.ceil(COOLDOWN_MINUTES - minutesSince);
        return {
            canScrape: false,
            error: `Please wait ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} before scraping again`,
            minutesRemaining
        };
    }

    return { canScrape: true };
}

/**
 * Save scraped data to database
 * Uses exactly the same DB/B2 logic as the original Apify scraper.
 */
async function saveScrapedData(supabase, familyId, scrapeResult) {
    const { profile, content, scrapedAt } = scrapeResult;
    console.log(`[RapidAPI] saveScrapedData: profilePicUrl=${profile.profilePicUrl ? 'YES' : 'NO'}, B2=${isB2Configured()}`);

    try {
        let profilePicUrl = profile.profilePicUrl;
        if (isB2Configured() && profilePicUrl) {
            console.log('[RapidAPI] Uploading profile pic to B2...');
            profilePicUrl = await uploadProfilePic(profilePicUrl, familyId);
        }

        const { error: profileError } = await supabase
            .from('mothers_profiles')
            .upsert({
                family_id: familyId,
                instagram_username: profile.username,
                full_name: profile.fullName,
                biography: profile.biography,
                profile_pic_url: profilePicUrl,
                followers_count: profile.followersCount,
                following_count: profile.followingCount,
                posts_count: profile.postsCount,
                is_verified: profile.isVerified,
                external_url: profile.externalUrl,
                fundraiser_links: profile.fundraiserLinks,
                last_scraped_at: scrapedAt,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'family_id' });

        if (profileError) {
            return { error: `Failed to save profile: ${profileError.message}` };
        }

        if (content && content.length > 0) {
            const contentRows = content.map(item => ({
                family_id: familyId,
                instagram_id: item.id,
                short_code: item.shortCode,
                content_type: item.type,
                caption: item.caption,
                display_url: item.displayUrl,
                video_url: item.videoUrl,
                likes_count: item.likesCount,
                comments_count: item.commentsCount,
                posted_at: item.timestamp,
                location_name: item.locationName,
                hashtags: item.hashtags,
                mentions: item.mentions,
                is_video: item.isVideo,
                scraped_at: scrapedAt,
            }));

            const { error: contentError } = await supabase
                .from('mothers_content')
                .upsert(contentRows, { onConflict: 'family_id,short_code' });

            if (contentError) {
                console.error('[RapidAPI] Content save error:', contentError);
            }

            const { data: needsDesc } = await supabase
                .from('mothers_content')
                .select('id, caption')
                .eq('family_id', familyId)
                .is('description', null)
                .neq('caption', '');

            if (needsDesc && needsDesc.length > 0) {
                for (const row of needsDesc) {
                    if (row.caption) {
                        await supabase.from('mothers_content').update({ description: row.caption }).eq('id', row.id);
                    }
                }
            }

            if (isB2Configured()) {
                (async () => {
                    for (const item of content) {
                        try {
                            let b2Display = null;
                            let b2Video = null;
                            if (item.displayUrl) b2Display = await uploadPostImage(item.displayUrl, familyId, item.shortCode);
                            if (item.videoUrl) b2Video = await uploadVideo(item.videoUrl, familyId, item.shortCode);
                            
                            if (b2Display || b2Video) {
                                const update = {};
                                if (b2Display) update.display_url = b2Display;
                                if (b2Video) update.video_url = b2Video;
                                await supabase.from('mothers_content').update(update)
                                    .eq('family_id', familyId)
                                    .eq('short_code', item.shortCode);
                            }
                        } catch (err) {
                            console.error(`[RapidAPI] B2 upload failed for ${item.shortCode}:`, err.message);
                        }
                    }
                })();
            }
        }

        await supabase.from('families').update({
            instagram_handle: profile.username,
            profile_pic_url: profilePicUrl,
            ig_profile_scraped: true,
        }).eq('id', familyId);

        return { success: true, profileSaved: true, contentSaved: content?.length || 0, b2Enabled: isB2Configured() };
    } catch (err) {
        return { error: err.message };
    }
}

// NOTE: Apify's "Engagement" scraping (likers and commenters) usually requires a different endpoint
// in RapidAPI or is absent. The methods below are mocked to prevent app breaking when migrating.
async function scrapeEngagedFollowers(username, postsToScan = 10) {
    console.log(`[RapidAPI] Engaged followers scrape is not natively supported in this basic API iteration.`);
    return { success: true, engagedFollowers: [], postsScanned: 0, scrapedAt: new Date().toISOString() };
}

async function saveEngagedFollowers(supabase, familyId, engagedFollowers) {
    return { success: true, saved: 0 };
}

module.exports = {
    checkAccountPublic,
    scrapeProfile,
    checkScrapeCooldown,
    saveScrapedData,
    extractFundraiserLinks,
    scrapeEngagedFollowers,
    saveEngagedFollowers,
};
