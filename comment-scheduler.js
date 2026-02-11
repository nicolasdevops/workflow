/**
 * Comment Scheduler Module
 *
 * Multi-timezone scheduler for automated Instagram commenting.
 * Checks every minute if it's time to post based on day-specific schedules.
 */

const { renderTemplate, selectUnusedTemplate, incrementUsageCount } = require('./template-renderer');

// Check interval (1 minute)
const CHECK_INTERVAL_MS = 60 * 1000;

// Default timezone (NA East Coast)
const DEFAULT_TIMEZONE = 'America/New_York';

// Maximum post age to comment on (6 hours)
const MAX_POST_AGE_HOURS = 6;

// Delay between families (Gaussian: 30s ± 10s)
const FAMILY_DELAY_MS = 30000;
const FAMILY_DELAY_STDEV = 10000;

/**
 * Gaussian random number generator
 */
function gaussianRandom(mean, stdev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, z0 * stdev + mean);
}

/**
 * Comment Scheduler class
 */
class CommentScheduler {
    constructor(supabase, InstagramAutomation) {
        this.supabase = supabase;
        this.InstagramAutomation = InstagramAutomation;
        this.schedules = [];
        this.isRunning = false;
        this.intervalId = null;
        this.lastCheckTime = null;
    }

    /**
     * Load schedules from database
     */
    async loadSchedules() {
        const { data, error } = await this.supabase
            .from('comment_schedule')
            .select('*')
            .eq('is_active', true);

        if (error) {
            console.error('[CommentScheduler] Error loading schedules:', error.message);
            return [];
        }

        this.schedules = data || [];
        console.log(`[CommentScheduler] Loaded ${this.schedules.length} schedule slots`);
        return this.schedules;
    }

    /**
     * Check if current time matches any schedule slot
     * @param {string} timezone - IANA timezone ID
     * @returns {object|null} Matching schedule or null
     */
    isTimeToPost(timezone = DEFAULT_TIMEZONE) {
        const now = new Date();

        // Get current day and time in the target timezone
        const options = { timeZone: timezone };

        // Get day of week (0 = Sunday, 1 = Monday, etc.)
        // Use weekday: 'short' and map to number since 'numeric' is not valid
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = now.toLocaleDateString('en-US', { ...options, weekday: 'short' });
        const dayOfWeek = dayNames.indexOf(dayName);

        // Get current time as HH:MM
        const currentTime = now.toLocaleTimeString('en-US', {
            ...options,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
        });

        // Find matching schedule
        const match = this.schedules.find(s => {
            // Format stored time_slot to HH:MM for comparison
            const slotTime = s.time_slot.substring(0, 5); // "07:30:00" -> "07:30"
            return s.day_of_week === dayOfWeek && slotTime === currentTime;
        });

        if (match) {
            console.log(`[CommentScheduler] Time match! Day: ${dayOfWeek}, Time: ${currentTime}`);
        }

        return match || null;
    }

    /**
     * Get families that are ready to comment
     */
    async getActiveFamilies() {
        const { data, error } = await this.supabase
            .from('families')
            .select('id, name, ig_username, session_cookies, children_count, children_ages, proxy_city, proxy_country, timezone, geo_latitude, geo_longitude')
            .eq('commenting_enabled', true)
            .eq('ig_account_status', 'active')
            .not('ig_username', 'is', null)
            .not('session_cookies', 'is', null);

        if (error) {
            console.error('[CommentScheduler] Error fetching families:', error.message);
            return [];
        }

        console.log(`[CommentScheduler] Found ${(data || []).length} active families`);
        return data || [];
    }

    /**
     * Select a target account (weighted by quality score)
     */
    async selectTargetAccount() {
        const { data, error } = await this.supabase
            .from('target_accounts')
            .select('*')
            .eq('is_active', true)
            .order('quality_score', { ascending: false });

        if (error || !data || data.length === 0) {
            console.error('[CommentScheduler] No target accounts available');
            return null;
        }

        // Weighted random selection based on quality_score
        // Higher score = higher chance of selection
        const totalScore = data.reduce((sum, a) => sum + (a.quality_score || 50), 0);
        let random = Math.random() * totalScore;

        for (const account of data) {
            random -= (account.quality_score || 50);
            if (random <= 0) {
                return account;
            }
        }

        // Fallback to first
        return data[0];
    }

    /**
     * Check if a post is fresh enough to comment on
     * @param {string} timestamp - ISO timestamp
     * @returns {boolean}
     */
    isPostFresh(timestamp) {
        if (!timestamp) return false;

        const postDate = new Date(timestamp);
        const now = new Date();
        const hoursOld = (now - postDate) / (1000 * 60 * 60);

        return hoursOld <= MAX_POST_AGE_HOURS;
    }

    /**
     * Check if we already commented on this post (any family)
     */
    async hasCommentedOnPost(postUrl) {
        const { data, error } = await this.supabase
            .from('posted_comments')
            .select('id')
            .eq('post_url', postUrl)
            .eq('status', 'posted')
            .limit(1);

        return !error && data && data.length > 0;
    }

    /**
     * Record a posted comment
     */
    async recordComment(familyId, targetAccountId, templateId, postUrl, renderedComment, status = 'posted', errorMessage = null) {
        const { error } = await this.supabase
            .from('posted_comments')
            .insert({
                family_id: familyId,
                target_account_id: targetAccountId,
                template_id: templateId,
                post_url: postUrl,
                post_shortcode: postUrl.split('/p/')[1]?.split('/')[0] || null,
                rendered_comment: renderedComment,
                status: status,
                error_message: errorMessage,
            });

        if (error) {
            console.error('[CommentScheduler] Error recording comment:', error.message);
        }

        // Increment template usage
        if (status === 'posted') {
            await incrementUsageCount(this.supabase, templateId);
        }
    }

    /**
     * Update target account's last checked timestamp
     */
    async updateTargetLastChecked(targetAccountId, postUrl) {
        await this.supabase
            .from('target_accounts')
            .update({
                last_post_url: postUrl,
                last_post_checked_at: new Date().toISOString(),
            })
            .eq('id', targetAccountId);
    }

    /**
     * Run a single commenting round for one family
     */
    async runForFamily(family) {
        console.log(`[CommentScheduler] Processing family: ${family.name || family.id}`);

        let bot = null;

        try {
            // 1. Select target account
            const target = await this.selectTargetAccount();
            if (!target) {
                console.log('[CommentScheduler] No target account available');
                return;
            }

            console.log(`[CommentScheduler] Selected target: @${target.handle}`);

            // 2. Initialize browser with family's proxy config
            bot = new this.InstagramAutomation(
                family.ig_username,
                {
                    city: family.proxy_city,
                    country: family.proxy_country,
                    timezone: family.timezone,
                    latitude: family.geo_latitude,
                    longitude: family.geo_longitude,
                }
            );

            await bot.init();

            // 3. Restore session cookies
            if (family.session_cookies) {
                const cookies = JSON.parse(family.session_cookies);
                await bot.page.context().addCookies(cookies);
            }

            // 4. Get latest post from target
            const postInfo = await bot.getLatestPostInfo(target.handle);

            if (!postInfo || !postInfo.url) {
                console.log(`[CommentScheduler] No post found for @${target.handle}`);
                await this.updateTargetLastChecked(target.id, null);
                await bot.close();
                return;
            }

            console.log(`[CommentScheduler] Found post: ${postInfo.url}`);

            // 5. Check if post is fresh
            if (!this.isPostFresh(postInfo.timestamp)) {
                console.log(`[CommentScheduler] Post too old: ${postInfo.timestamp}`);
                await this.updateTargetLastChecked(target.id, postInfo.url);
                await bot.close();
                return;
            }

            // 6. Check if we already commented on this post with this family
            const { data: existingComment } = await this.supabase
                .from('posted_comments')
                .select('id')
                .eq('post_url', postInfo.url)
                .eq('family_id', family.id)
                .eq('status', 'posted')
                .limit(1);

            if (existingComment && existingComment.length > 0) {
                console.log(`[CommentScheduler] Already commented on this post with this family`);
                await bot.close();
                return;
            }

            // 7. Select unused template
            const template = await selectUnusedTemplate(this.supabase, postInfo.url, family);

            if (!template) {
                console.log(`[CommentScheduler] No unused templates for this post`);
                await bot.close();
                return;
            }

            // 8. Render template with family data
            const renderedComment = renderTemplate(template.template_text, family);

            console.log(`[CommentScheduler] Posting comment (template ${template.id})`);
            console.log(`[CommentScheduler] Comment preview: ${renderedComment.substring(0, 100)}...`);

            // 9. Post the comment
            const result = await bot.postComment(postInfo.url, renderedComment);

            // 10. Record result
            if (result.success) {
                console.log(`[CommentScheduler] Comment posted successfully!`);
                await this.recordComment(
                    family.id,
                    target.id,
                    template.id,
                    postInfo.url,
                    renderedComment,
                    'posted'
                );
            } else {
                console.error(`[CommentScheduler] Comment failed: ${result.error}`);
                await this.recordComment(
                    family.id,
                    target.id,
                    template.id,
                    postInfo.url,
                    renderedComment,
                    'failed',
                    result.error
                );
            }

            // 11. Update target's last checked
            await this.updateTargetLastChecked(target.id, postInfo.url);

            // 12. Close browser
            await bot.close();

        } catch (error) {
            console.error(`[CommentScheduler] Error for family ${family.id}:`, error.message);
            if (bot) {
                try { await bot.close(); } catch (e) {}
            }
        }
    }

    /**
     * Run a scheduled commenting round
     */
    async runScheduledRound() {
        console.log(`[CommentScheduler] Starting scheduled round at ${new Date().toISOString()}`);

        // Get active families
        const families = await this.getActiveFamilies();

        if (families.length === 0) {
            console.log('[CommentScheduler] No active families to process');
            return;
        }

        // Process each family with delays
        for (let i = 0; i < families.length; i++) {
            const family = families[i];

            // Run for this family
            await this.runForFamily(family);

            // Delay before next family (unless last)
            if (i < families.length - 1) {
                const delay = gaussianRandom(FAMILY_DELAY_MS, FAMILY_DELAY_STDEV);
                console.log(`[CommentScheduler] Waiting ${Math.round(delay / 1000)}s before next family...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        console.log(`[CommentScheduler] Round complete. Processed ${families.length} families.`);
    }

    /**
     * Main check loop (runs every minute)
     */
    async check() {
        // Prevent duplicate checks within same minute
        const now = new Date();
        const currentMinute = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

        if (this.lastCheckTime === currentMinute) {
            return;
        }
        this.lastCheckTime = currentMinute;

        // Check if it's time to post
        const matchingSlot = this.isTimeToPost(DEFAULT_TIMEZONE);

        if (matchingSlot) {
            console.log(`[CommentScheduler] Matched schedule slot: ${matchingSlot.time_slot}`);
            await this.runScheduledRound();
        }
    }

    /**
     * Start the scheduler
     */
    async start() {
        if (this.isRunning) {
            console.log('[CommentScheduler] Already running');
            return;
        }

        console.log('[CommentScheduler] Starting scheduler...');

        // Load schedules
        await this.loadSchedules();

        if (this.schedules.length === 0) {
            console.log('[CommentScheduler] No schedules found, scheduler inactive');
            return;
        }

        // Start check loop
        this.isRunning = true;
        this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL_MS);

        // Run initial check
        await this.check();

        console.log('[CommentScheduler] Scheduler started');
    }

    /**
     * Stop the scheduler
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[CommentScheduler] Scheduler stopped');
    }

    /**
     * Manually trigger a round (for testing)
     */
    async triggerManual() {
        console.log('[CommentScheduler] Manual trigger');
        await this.runScheduledRound();
    }
}

module.exports = { CommentScheduler };
