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

        // Wait for run to complete (with timeout - 90s for profile check)
        const result = await waitForApifyRun(runId, 90000);

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

            // Log profile fields for debugging
            console.log('[Apify] Profile details keys:', Object.keys(profile).join(', '));
            console.log(`[Apify] Profile stats: followers=${profile.followersCount}, posts=${profile.postsCount || profile.mediaCount}`);

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
    const pollInterval = 5000; // Poll every 5 seconds
    let pollCount = 0;

    console.log(`[Apify] Waiting for run ${runId} (timeout: ${timeoutMs/1000}s)`);

    while (Date.now() - startTime < timeoutMs) {
        pollCount++;
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        try {
            const statusRes = await fetch(
                `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
            );

            if (!statusRes.ok) {
                const errText = await statusRes.text();
                console.error(`[Apify] Run status check failed: ${statusRes.status} - ${errText}`);
                return { error: `Failed to check run status: ${statusRes.status}` };
            }

            const statusData = await statusRes.json();
            const status = statusData.data?.status;
            const statusMessage = statusData.data?.statusMessage || '';

            console.log(`[Apify] Poll #${pollCount} (${elapsed}s): status=${status} ${statusMessage ? `(${statusMessage})` : ''}`);

            if (status === 'SUCCEEDED') {
                // Fetch results from dataset
                const datasetId = statusData.data?.defaultDatasetId;
                if (!datasetId) {
                    console.error('[Apify] Run succeeded but no dataset found');
                    return { error: 'No dataset found' };
                }

                console.log(`[Apify] Run succeeded, fetching dataset ${datasetId}`);
                const dataRes = await fetch(
                    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`
                );

                if (!dataRes.ok) {
                    return { error: `Failed to fetch results: ${dataRes.status}` };
                }

                const data = await dataRes.json();
                console.log(`[Apify] Got ${data.length} items from dataset`);
                return { data };
            }

            if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
                console.error(`[Apify] Run ended with status: ${status} - ${statusMessage}`);
                return { error: `Apify run ${status.toLowerCase()}: ${statusMessage || 'no details'}` };
            }

            // Still running (READY, RUNNING), wait and poll again
            await new Promise(r => setTimeout(r, pollInterval));

        } catch (err) {
            console.error(`[Apify] Poll error:`, err);
            return { error: err.message };
        }
    }

    console.error(`[Apify] Run ${runId} timed out after ${timeoutMs/1000}s (${pollCount} polls)`);
    return { error: `Timeout after ${timeoutMs/1000}s waiting for Apify run to complete` };
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

        console.log(`[Apify] Run started: ${runId}, scraping up to ${postsLimit} posts...`);

        // Wait for completion - 5 min timeout for full scrape (large profiles take time)
        const result = await waitForApifyRun(runId, 300000);

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

        // If we don't have complete profile data (with stats), fetch it separately
        // Posts API returns owner data but without follower counts
        const hasStats = profileData?.followersCount || profileData?.postsCount;
        if (!profileData || !hasStats) {
            console.log('[Apify] Fetching full profile details (posts API lacks stats)...');
            const profileResult = await checkAccountPublic(cleanUsername);
            if (profileResult.profileData) {
                // Merge with existing data (keep what we have, add missing fields)
                profileData = {
                    ...profileData,
                    ...profileResult.profileData,
                };
                console.log(`[Apify] Got full profile: ${profileData.followersCount} followers, ${profileData.postsCount} posts`);
            }
        }

        // Extract bio and fundraiser links
        const bio = profileData?.biography || profileData?.bio || '';
        const fundraiserLinks = extractFundraiserLinks(bio);

        // Debug: log profile pic URL
        const profilePicUrl = profileData?.profilePicUrl || profileData?.profilePicUrlHD || '';
        console.log(`[Apify] Profile pic URL: ${profilePicUrl ? profilePicUrl.substring(0, 80) + '...' : 'EMPTY'}`);

        return {
            success: true,
            profile: {
                username: profileData?.username || cleanUsername,
                fullName: profileData?.fullName || profileData?.full_name || '',
                biography: bio,
                profilePicUrl,
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
 * Check cooldown for a family (2 minutes for testing, change to 24 hours for production)
 * @param {object} supabase - Supabase client
 * @param {string} familyId - Family UUID
 */
async function checkScrapeCooldown(supabase, familyId) {
    const COOLDOWN_MINUTES = 2; // Change to 1440 (24 hours) for production

    console.log(`[Apify] Checking cooldown for family ${familyId}`);

    const { data, error } = await supabase
        .from('mothers_profiles')
        .select('last_scraped_at')
        .eq('family_id', familyId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.log(`[Apify] Cooldown check error: ${error.message}`);
        return { canScrape: false, error: error.message };
    }

    if (!data || !data.last_scraped_at) {
        console.log(`[Apify] No previous scrape found, can scrape`);
        return { canScrape: true };
    }

    console.log(`[Apify] Last scraped at: ${data.last_scraped_at}`);

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
 * If B2 is configured, uploads media to B2 for persistent storage
 */
async function saveScrapedData(supabase, familyId, scrapeResult) {
    const { profile, content, scrapedAt } = scrapeResult;

    console.log(`[Apify] saveScrapedData: profilePicUrl=${profile.profilePicUrl ? 'YES' : 'NO'}, B2=${isB2Configured()}`);

    try {
        // Upload profile pic to B2 if configured
        let profilePicUrl = profile.profilePicUrl;
        if (isB2Configured() && profilePicUrl) {
            console.log('[Apify] Uploading profile pic to B2...');
            profilePicUrl = await uploadProfilePic(profilePicUrl, familyId);
            console.log(`[Apify] Profile pic uploaded: ${profilePicUrl ? profilePicUrl.substring(0, 60) + '...' : 'FAILED'}`);
        } else if (!profilePicUrl) {
            console.log('[Apify] No profile pic URL to upload');
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

/**
 * Scrape likers and commenters from a post
 * @param {string} postUrl - Full Instagram post URL or shortcode
 * @param {number} likersLimit - Max likers to fetch (default 100)
 * @param {number} commentersLimit - Max commenters to fetch (default 50)
 */
async function scrapePostEngagement(postUrl, likersLimit = 100, commentersLimit = 50) {
    if (!APIFY_API_TOKEN) {
        return { error: 'APIFY_API_TOKEN not configured' };
    }

    // Extract shortcode if full URL provided
    let shortcode = postUrl;
    if (postUrl.includes('instagram.com')) {
        const match = postUrl.match(/\/(?:p|reel)\/([^\/\?]+)/);
        if (match) shortcode = match[1];
    }

    const fullUrl = `https://www.instagram.com/p/${shortcode}/`;
    console.log(`[Apify] Scraping engagement for post: ${fullUrl}`);

    try {
        // Use instagram-post-scraper for comments and likes
        // This actor can fetch post details including likers and comments
        const response = await fetch(`https://api.apify.com/v2/acts/apify~instagram-comment-scraper/runs?token=${APIFY_API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                directUrls: [fullUrl],
                resultsLimit: commentersLimit,
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Apify] Comment scraper error: ${response.status} - ${errText}`);
            // Fall back to posts scraper for likes only
            return await scrapePostLikers(shortcode, likersLimit);
        }

        const runData = await response.json();
        const runId = runData.data?.id;

        if (!runId) {
            return { error: 'Failed to start comment scrape run' };
        }

        console.log(`[Apify] Comment scrape run started: ${runId}`);
        const result = await waitForApifyRun(runId, 180000); // 3 min timeout

        if (result.error) {
            console.error(`[Apify] Comment scrape failed: ${result.error}`);
            // Try likers only as fallback
            return await scrapePostLikers(shortcode, likersLimit);
        }

        const comments = result.data || [];
        const commenters = [];

        for (const comment of comments) {
            if (comment.ownerUsername) {
                commenters.push({
                    username: comment.ownerUsername,
                    fullName: comment.ownerFullName || '',
                    profilePicUrl: comment.ownerProfilePicUrl || '',
                    engagementType: 'comment',
                    postShortcode: shortcode,
                });
            }
        }

        console.log(`[Apify] Found ${commenters.length} commenters`);

        // Also try to get likers
        const likersResult = await scrapePostLikers(shortcode, likersLimit);
        const likers = likersResult.likers || [];

        return {
            success: true,
            shortcode,
            commenters,
            likers,
            totalEngaged: commenters.length + likers.length,
        };

    } catch (err) {
        console.error('[Apify] Post engagement scrape error:', err);
        return { error: err.message };
    }
}

/**
 * Scrape likers from a post using Instagram Post Scraper
 * @param {string} shortcode - Post shortcode
 * @param {number} limit - Max likers to fetch
 */
async function scrapePostLikers(shortcode, limit = 100) {
    try {
        const fullUrl = `https://www.instagram.com/p/${shortcode}/`;

        // Use instagram-api-scraper with post URL to get post details including some likers
        const response = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                directUrls: [fullUrl],
                resultsType: 'details',
                resultsLimit: 1,
            })
        });

        if (!response.ok) {
            return { likers: [], error: 'Failed to fetch post likers' };
        }

        const runData = await response.json();
        const runId = runData.data?.id;

        if (!runId) {
            return { likers: [] };
        }

        const result = await waitForApifyRun(runId, 120000);

        if (result.error || !result.data || result.data.length === 0) {
            return { likers: [] };
        }

        const postData = result.data[0];
        const likers = [];

        // Extract likers if available (depends on Apify actor capabilities)
        if (postData.likers && Array.isArray(postData.likers)) {
            for (const liker of postData.likers.slice(0, limit)) {
                likers.push({
                    username: liker.username || liker,
                    fullName: liker.fullName || liker.full_name || '',
                    profilePicUrl: liker.profilePicUrl || '',
                    engagementType: 'like',
                    postShortcode: shortcode,
                });
            }
        }

        // Also check latestComments for additional engagement data
        if (postData.latestComments && Array.isArray(postData.latestComments)) {
            for (const comment of postData.latestComments) {
                if (comment.ownerUsername) {
                    likers.push({
                        username: comment.ownerUsername,
                        fullName: comment.ownerFullName || '',
                        profilePicUrl: comment.ownerProfilePicUrl || '',
                        engagementType: 'comment',
                        postShortcode: shortcode,
                    });
                }
            }
        }

        console.log(`[Apify] Found ${likers.length} likers/commenters from post details`);
        return { likers };

    } catch (err) {
        console.error('[Apify] Likers scrape error:', err);
        return { likers: [], error: err.message };
    }
}

/**
 * Scrape engaged followers from multiple posts for a family
 * @param {string} username - Instagram username
 * @param {number} postsToScan - Number of recent posts to scan (default 10)
 */
async function scrapeEngagedFollowers(username, postsToScan = 10) {
    console.log(`[Apify] Scraping engaged followers for @${username} (${postsToScan} posts)`);

    // First get recent posts
    const profileResult = await scrapeProfile(username, postsToScan);

    if (profileResult.error) {
        return { error: profileResult.error };
    }

    const posts = profileResult.content || [];
    console.log(`[Apify] Found ${posts.length} posts to scan for engagement`);

    const allEngaged = new Map(); // username -> engagement data

    for (const post of posts) {
        console.log(`[Apify] Scanning post ${post.shortCode}...`);

        const engagement = await scrapePostEngagement(
            post.shortCode,
            50,  // likers per post
            30   // commenters per post
        );

        if (engagement.error) {
            console.log(`[Apify] Skipping post ${post.shortCode}: ${engagement.error}`);
            continue;
        }

        // Merge likers
        for (const liker of engagement.likers || []) {
            const existing = allEngaged.get(liker.username);
            if (existing) {
                existing.engagementCount++;
                existing.lastPostShortcode = post.shortCode;
            } else {
                allEngaged.set(liker.username, {
                    ...liker,
                    engagementCount: 1,
                    lastPostShortcode: post.shortCode,
                });
            }
        }

        // Merge commenters
        for (const commenter of engagement.commenters || []) {
            const existing = allEngaged.get(commenter.username);
            if (existing) {
                existing.engagementCount++;
                existing.lastPostShortcode = post.shortCode;
                // Upgrade engagement type if they also comment
                if (existing.engagementType === 'like') {
                    existing.engagementType = 'comment';
                }
            } else {
                allEngaged.set(commenter.username, {
                    ...commenter,
                    engagementCount: 1,
                    lastPostShortcode: post.shortCode,
                });
            }
        }

        // Small delay between posts
        await new Promise(r => setTimeout(r, 2000));
    }

    const engagedFollowers = Array.from(allEngaged.values());
    console.log(`[Apify] Total unique engaged followers: ${engagedFollowers.length}`);

    return {
        success: true,
        engagedFollowers,
        postsScanned: posts.length,
        scrapedAt: new Date().toISOString(),
    };
}

/**
 * Save engaged followers to database
 * @param {object} supabase - Supabase client
 * @param {number} familyId - Family ID
 * @param {array} engagedFollowers - Array of engaged follower objects
 */
async function saveEngagedFollowers(supabase, familyId, engagedFollowers) {
    if (!engagedFollowers || engagedFollowers.length === 0) {
        return { success: true, saved: 0 };
    }

    console.log(`[Apify] Saving ${engagedFollowers.length} engaged followers for family ${familyId}`);

    try {
        const now = new Date().toISOString();
        const rows = engagedFollowers.map(ef => ({
            family_id: familyId,
            username: ef.username,
            full_name: ef.fullName || null,
            profile_pic_url: ef.profilePicUrl || null,
            engagement_type: ef.engagementType,
            post_shortcode: ef.lastPostShortcode || ef.postShortcode,
            engagement_count: ef.engagementCount || 1,
            last_seen_at: now,
        }));

        // Upsert - update if username already exists for this family
        const { error } = await supabase
            .from('engaged_followers')
            .upsert(rows, {
                onConflict: 'family_id,username',
                ignoreDuplicates: false,
            });

        if (error) {
            console.error('[Apify] Save engaged followers error:', error);
            return { error: error.message };
        }

        // Update family's last backup timestamp
        await supabase
            .from('families')
            .update({ last_followers_backup_at: now })
            .eq('id', familyId);

        console.log(`[Apify] Saved ${rows.length} engaged followers`);
        return { success: true, saved: rows.length };

    } catch (err) {
        console.error('[Apify] Save engaged followers error:', err);
        return { error: err.message };
    }
}

module.exports = {
    checkAccountPublic,
    scrapeProfile,
    checkScrapeCooldown,
    saveScrapedData,
    extractFundraiserLinks,
    scrapePostEngagement,
    scrapeEngagedFollowers,
    saveEngagedFollowers,
};
