/**
 * Apify Instagram Scraper Module
 *
 * Uses Apify's Instagram Scraper to fetch public profile data
 * without requiring Instagram login credentials.
 *
 * Features:
 * - Profile data: bio, name, profile pic, follower count
 * - Fundraiser link extraction from bio
 * - Content scraping: posts, reels, etc.
 * - 24-hour cooldown between scrapes
 * - Backblaze B2 storage for persistent media URLs
 */

const { isB2Configured, uploadProfilePic, uploadPostImage, uploadVideo } = require('./b2-storage');

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
// Use instagram-api-scraper which accepts directUrls
// Note: Tilde (~) is required in URL path, not slash (/)
const APIFY_ACTOR_ID = 'apify~instagram-api-scraper';

// Regex patterns for fundraiser links
const FUNDRAISER_PATTERNS = [
    /gofundme\.com\/[^\s\)\"]+/gi,
    /chuffed\.org\/[^\s\)\"]+/gi,
    /givesendgo\.com\/[^\s\)\"]+/gi,
    /justgiving\.com\/[^\s\)\"]+/gi,
    /gofund\.me\/[^\s\)\"]+/gi,
    /paypal\.me\/[^\s\)\"]+/gi,
    /buymeacoffee\.com\/[^\s\)\"]+/gi,
    /ko-fi\.com\/[^\s\)\"]+/gi,
    // Linktree, etc.
    /linktr\.ee\/[^\s\)\"]+/gi,
    /bit\.ly\/[^\s\)\"]+/gi,
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

    // Also extract any URLs from bio
    const urlPattern = /https?:\/\/[^\s\)\"]+/gi;
    const urlMatches = bioText.match(urlPattern);
    if (urlMatches) {
        links.push(...urlMatches);
    }

    return [...new Set(links)]; // Remove duplicates
}

/**
 * Check if Instagram account is public using Apify
 * Returns: { isPublic: boolean, error?: string }
 */
async function checkAccountPublic(username) {
    if (!APIFY_API_TOKEN) {
        return { isPublic: false, error: 'APIFY_API_TOKEN not configured' };
    }

    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

    try {
        // Run a minimal scrape to check if profile is public
        // Use directUrls with full Instagram URL format
        const profileUrl = `https://www.instagram.com/${cleanUsername}/`;
        console.log(`[Apify] Checking profile URL: ${profileUrl}`);

        const response = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                directUrls: [profileUrl],
                resultsType: 'details',
                resultsLimit: 1,
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return { isPublic: false, error: `Apify API error: ${response.status} - ${errText}` };
        }

        const runData = await response.json();
        const runId = runData.data?.id;

        if (!runId) {
            return { isPublic: false, error: 'Failed to start Apify run' };
        }

        // Wait for run to complete (with timeout)
        const result = await waitForApifyRun(runId, 60000);

        if (result.error) {
            return { isPublic: false, error: result.error };
        }

        // Check if we got profile data
        if (result.data && result.data.length > 0) {
            const profile = result.data[0];

            // Check if Apify returned an error response
            if (profile.error) {
                console.log(`[Apify] Check public returned error: ${profile.error} - ${profile.errorDescription || ''}`);
                return { isPublic: false, error: profile.errorDescription || profile.error || 'Account may be private or not found' };
            }

            // If isPrivate is true, account is private
            if (profile.isPrivate || profile.private) {
                return { isPublic: false, error: 'Account is private. Only public accounts can be scraped.' };
            }
            return { isPublic: true, profileData: profile };
        }

        return { isPublic: false, error: 'Account not found or is private' };

    } catch (err) {
        console.error('[Apify] Check public error:', err);
        return { isPublic: false, error: err.message };
    }
}

/**
 * Wait for Apify run to complete and fetch results
 */
async function waitForApifyRun(runId, timeoutMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const statusRes = await fetch(
                `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
            );

            if (!statusRes.ok) {
                return { error: `Failed to check run status: ${statusRes.status}` };
            }

            const statusData = await statusRes.json();
            const status = statusData.data?.status;

            if (status === 'SUCCEEDED') {
                // Fetch results from dataset
                const datasetId = statusData.data?.defaultDatasetId;
                if (!datasetId) {
                    return { error: 'No dataset found' };
                }

                const dataRes = await fetch(
                    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`
                );

                if (!dataRes.ok) {
                    return { error: `Failed to fetch results: ${dataRes.status}` };
                }

                const data = await dataRes.json();
                return { data };
            }

            if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
                return { error: `Apify run ${status.toLowerCase()}` };
            }

            // Still running, wait and poll again
            await new Promise(r => setTimeout(r, pollInterval));

        } catch (err) {
            return { error: err.message };
        }
    }

    return { error: 'Timeout waiting for Apify run to complete' };
}

/**
 * Scrape full profile data including posts
 * @param {string} username - Instagram username
 * @param {number} postsLimit - Maximum posts to scrape (default 50)
 */
async function scrapeProfile(username, postsLimit = 50) {
    if (!APIFY_API_TOKEN) {
        return { error: 'APIFY_API_TOKEN not configured' };
    }

    const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

    try {
        console.log(`[Apify] Starting scrape for @${cleanUsername}`);

        // Use directUrls with full Instagram URL format
        const profileUrl = `https://www.instagram.com/${cleanUsername}/`;

        // Start full profile scrape
        const response = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                directUrls: [profileUrl],
                resultsType: 'posts',
                resultsLimit: postsLimit,
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return { error: `Apify API error: ${response.status} - ${errText}` };
        }

        const runData = await response.json();
        const runId = runData.data?.id;

        if (!runId) {
            return { error: 'Failed to start Apify scrape run' };
        }

        console.log(`[Apify] Run started: ${runId}`);

        // Wait for completion
        const result = await waitForApifyRun(runId, 180000); // 3 min timeout for full scrape

        if (result.error) {
            return { error: result.error };
        }

        if (!result.data || result.data.length === 0) {
            return { error: 'No data returned from scrape' };
        }

        // Parse the results
        const posts = result.data;

        // Debug: Log first item structure to understand Apify response format
        if (posts.length > 0) {
            console.log('[Apify] First item keys:', Object.keys(posts[0]));
            console.log('[Apify] First item sample:', JSON.stringify(posts[0], null, 2).substring(0, 500));
        }

        // Check if Apify returned an error response (e.g., private account, no items)
        if (posts.length > 0 && posts[0].error) {
            const errorItem = posts[0];
            console.log(`[Apify] Scraper returned error: ${errorItem.error} - ${errorItem.errorDescription || ''}`);
            return {
                error: errorItem.errorDescription || errorItem.error || 'Account may be private or has no public content',
                isPrivateOrEmpty: true
            };
        }

        // Extract profile from first post's owner data (or look for profile-type item)
        let profileData = null;
        const contentItems = [];

        for (const item of posts) {
            // Check if this is profile data (various formats Apify might return)
            if (item.type === 'profile' || item.type === 'user' ||
                (!item.type && item.username && !item.shortCode && !item.url)) {
                profileData = item;
                console.log('[Apify] Found profile data item');
            } else {
                // This is a post/reel/content
                // Try multiple field names for shortCode
                const shortCode = item.shortCode || item.shortcode || item.code ||
                                  (item.url && item.url.match(/\/p\/([^\/]+)/)?.[1]) ||
                                  (item.url && item.url.match(/\/reel\/([^\/]+)/)?.[1]) ||
                                  item.id;

                if (!shortCode) {
                    console.log('[Apify] Skipping item without shortCode, keys:', Object.keys(item).join(', '));
                    continue;
                }

                // Try multiple field names for display URL
                const displayUrl = item.displayUrl || item.display_url || item.imageUrl ||
                                   item.thumbnailUrl || item.thumbnail_url || item.image;

                contentItems.push({
                    id: item.id || shortCode,
                    shortCode: shortCode,
                    type: item.type || item.productType || 'post',
                    caption: item.caption || item.text || '',
                    displayUrl: displayUrl,
                    videoUrl: item.videoUrl || item.video_url,
                    likesCount: item.likesCount || item.likes || item.likeCount || 0,
                    commentsCount: item.commentsCount || item.comments || item.commentCount || 0,
                    timestamp: item.timestamp || item.taken_at || item.takenAt,
                    locationName: item.locationName || item.location?.name,
                    hashtags: item.hashtags || [],
                    mentions: item.mentions || [],
                    isVideo: item.isVideo || item.is_video || item.type === 'video' || false,
                });

                // Try to get profile from post owner data (multiple field names)
                if (!profileData) {
                    const ownerUsername = item.ownerUsername || item.owner?.username || item.user?.username;
                    if (ownerUsername) {
                        profileData = {
                            username: ownerUsername,
                            fullName: item.ownerFullName || item.owner?.fullName || item.user?.full_name,
                            profilePicUrl: item.profilePicUrl || item.owner?.profilePicUrl || item.user?.profile_pic_url,
                            followersCount: item.owner?.followersCount || item.user?.follower_count,
                            biography: item.owner?.biography || item.user?.biography,
                        };
                        console.log('[Apify] Extracted profile from post owner:', ownerUsername);
                    }
                }
            }
        }

        console.log(`[Apify] Parsed ${contentItems.length} content items, profileData: ${!!profileData}`);

        // If we still don't have profile data, fetch it separately
        if (!profileData) {
            const profileResult = await checkAccountPublic(cleanUsername);
            if (profileResult.profileData) {
                profileData = profileResult.profileData;
            }
        }

        // Extract bio and fundraiser links
        const bio = profileData?.biography || profileData?.bio || '';
        const fundraiserLinks = extractFundraiserLinks(bio);

        return {
            success: true,
            profile: {
                username: profileData?.username || cleanUsername,
                fullName: profileData?.fullName || profileData?.full_name || '',
                biography: bio,
                profilePicUrl: profileData?.profilePicUrl || profileData?.profilePicUrlHD || '',
                followersCount: profileData?.followersCount || profileData?.followers || 0,
                followingCount: profileData?.followingCount || profileData?.following || 0,
                postsCount: profileData?.postsCount || profileData?.mediaCount || 0,
                isVerified: profileData?.isVerified || profileData?.verified || false,
                externalUrl: profileData?.externalUrl || profileData?.website || '',
                fundraiserLinks,
            },
            content: contentItems,
            scrapedAt: new Date().toISOString(),
        };

    } catch (err) {
        console.error('[Apify] Scrape error:', err);
        return { error: err.message };
    }
}

/**
 * Check 24-hour cooldown for a family
 * @param {object} supabase - Supabase client
 * @param {string} familyId - Family UUID
 */
async function checkScrapeCooldown(supabase, familyId) {
    const { data, error } = await supabase
        .from('mothers_profiles')
        .select('last_scraped_at')
        .eq('family_id', familyId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        return { canScrape: false, error: error.message };
    }

    if (!data || !data.last_scraped_at) {
        return { canScrape: true };
    }

    const lastScraped = new Date(data.last_scraped_at);
    const hoursSince = (Date.now() - lastScraped.getTime()) / (1000 * 60 * 60);

    if (hoursSince < 3) {
        const hoursRemaining = Math.ceil(3 - hoursSince);
        return {
            canScrape: false,
            error: `Please wait ${hoursRemaining} hours before scraping again`,
            hoursRemaining
        };
    }

    return { canScrape: true };
}

/**
 * Save scraped data to database
 * If B2 is configured, uploads media to B2 for persistent storage
 */
async function saveScrapedData(supabase, familyId, scrapeResult) {
    const { profile, content, scrapedAt } = scrapeResult;

    try {
        // Upload profile pic to B2 if configured
        let profilePicUrl = profile.profilePicUrl;
        if (isB2Configured() && profilePicUrl) {
            console.log('[Apify] Uploading profile pic to B2...');
            profilePicUrl = await uploadProfilePic(profilePicUrl, familyId);
        }

        // 1. Upsert mothers_profiles
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
            }, {
                onConflict: 'family_id'
            });

        if (profileError) {
            console.error('[Apify] Profile save error:', profileError);
            return { error: `Failed to save profile: ${profileError.message}` };
        }

        // 2. Insert/update content items (with B2 upload if configured)
        if (content && content.length > 0) {
            const contentRows = [];

            for (const item of content) {
                let displayUrl = item.displayUrl;
                let videoUrl = item.videoUrl;

                // Upload to B2 if configured
                if (isB2Configured()) {
                    if (displayUrl) {
                        console.log(`[Apify] Uploading post ${item.shortCode} to B2...`);
                        displayUrl = await uploadPostImage(displayUrl, familyId, item.shortCode);
                    }
                    if (videoUrl) {
                        console.log(`[Apify] Uploading video ${item.shortCode} to B2...`);
                        videoUrl = await uploadVideo(videoUrl, familyId, item.shortCode);
                    }
                }

                contentRows.push({
                    family_id: familyId,
                    instagram_id: item.id,
                    short_code: item.shortCode,
                    content_type: item.type,
                    caption: item.caption,
                    display_url: displayUrl,
                    video_url: videoUrl,
                    likes_count: item.likesCount,
                    comments_count: item.commentsCount,
                    posted_at: item.timestamp,
                    location_name: item.locationName,
                    hashtags: item.hashtags,
                    mentions: item.mentions,
                    is_video: item.isVideo,
                    scraped_at: scrapedAt,
                });
            }

            // Upsert content (update if short_code exists)
            const { error: contentError } = await supabase
                .from('mothers_content')
                .upsert(contentRows, {
                    onConflict: 'family_id,short_code',
                    ignoreDuplicates: false
                });

            if (contentError) {
                console.error('[Apify] Content save error:', contentError);
                // Don't fail the whole operation for content errors
            }
        }

        // 3. Update families table with profile info
        const { error: familyError } = await supabase
            .from('families')
            .update({
                instagram_handle: profile.username,
                profile_pic_url: profilePicUrl,
                ig_profile_scraped: true,
            })
            .eq('id', familyId);

        if (familyError) {
            console.error('[Apify] Family update error:', familyError);
        }

        return {
            success: true,
            profileSaved: true,
            contentSaved: content?.length || 0,
            b2Enabled: isB2Configured(),
        };

    } catch (err) {
        console.error('[Apify] Save error:', err);
        return { error: err.message };
    }
}

module.exports = {
    checkAccountPublic,
    scrapeProfile,
    checkScrapeCooldown,
    saveScrapedData,
    extractFundraiserLinks,
};
