/**
 * Engagement Tracker Module
 *
 * Periodically scrapes engagement (likes, replies) on posted comments
 * to calculate quality scores for target accounts.
 */

// Check interval (4 hours)
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// How far back to check comments (48 hours)
const MAX_COMMENT_AGE_HOURS = 48;

// Max comments to check per run
const MAX_COMMENTS_PER_RUN = 50;

/**
 * Engagement Tracker class
 */
class EngagementTracker {
    constructor(supabase, InstagramAutomation) {
        this.supabase = supabase;
        this.InstagramAutomation = InstagramAutomation;
        this.isRunning = false;
        this.intervalId = null;
    }

    /**
     * Get comments that need engagement checking
     */
    async getCommentsToCheck() {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - MAX_COMMENT_AGE_HOURS);

        const { data, error } = await this.supabase
            .from('posted_comments')
            .select('*, target_accounts(handle)')
            .eq('status', 'posted')
            .gte('posted_at', cutoffTime.toISOString())
            .order('last_engagement_check', { ascending: true, nullsFirst: true })
            .limit(MAX_COMMENTS_PER_RUN);

        if (error) {
            console.error('[EngagementTracker] Error fetching comments:', error.message);
            return [];
        }

        console.log(`[EngagementTracker] Found ${(data || []).length} comments to check`);
        return data || [];
    }

    /**
     * Scrape engagement for a single comment
     * @param {object} bot - InstagramAutomation instance
     * @param {object} comment - Comment record from database
     * @returns {object} { likes, replies, found }
     */
    async scrapeCommentEngagement(bot, comment) {
        try {
            console.log(`[EngagementTracker] Checking: ${comment.post_url}`);

            // Navigate to post
            await bot.page.goto(comment.post_url, { waitUntil: 'domcontentloaded' });
            await bot.page.waitForTimeout(3000);

            // Handle popups
            for (let i = 0; i < 3; i++) {
                try {
                    const closeButton = await bot.page.$('svg[aria-label="Close"]');
                    if (closeButton && await closeButton.isVisible()) {
                        await closeButton.click();
                        await bot.page.waitForTimeout(1000);
                    }
                } catch (e) {}
            }

            // Scroll to comments section
            await bot.page.evaluate(() => window.scrollBy(0, 500));
            await bot.page.waitForTimeout(2000);

            // Try to find our comment by matching text
            // This is tricky because Instagram's DOM is complex
            const commentTextShort = comment.rendered_comment.substring(0, 50);

            // Look for our comment in the comments section
            const commentElements = await bot.page.$$('span[class*="x193iq5w"], div[class*="comment"] span');

            let found = false;
            let likes = 0;
            let replies = 0;

            for (const el of commentElements) {
                try {
                    const text = await el.textContent();
                    if (text && text.includes(commentTextShort.substring(0, 30))) {
                        found = true;

                        // Try to find like count near this comment
                        // Instagram shows likes as "X likes" or just a heart icon
                        const parent = await el.evaluateHandle(e => e.closest('div[class*="comment"], li'));
                        if (parent) {
                            const likeText = await parent.evaluate(p => {
                                const likeEl = p.querySelector('[class*="like"] span, button[class*="like"] span');
                                return likeEl ? likeEl.textContent : '';
                            });

                            if (likeText) {
                                const match = likeText.match(/(\d+)/);
                                if (match) {
                                    likes = parseInt(match[1], 10);
                                }
                            }

                            // Count replies (nested comments)
                            const replyCount = await parent.evaluate(p => {
                                const replies = p.querySelectorAll('[class*="reply"], ul li');
                                return replies.length;
                            });
                            replies = replyCount || 0;
                        }

                        break;
                    }
                } catch (e) {
                    // Continue to next element
                }
            }

            if (found) {
                console.log(`[EngagementTracker] Found comment: ${likes} likes, ${replies} replies`);
            } else {
                console.log(`[EngagementTracker] Comment not found (may be hidden or deleted)`);
            }

            return { likes, replies, found };

        } catch (error) {
            console.error(`[EngagementTracker] Scrape error: ${error.message}`);
            return { likes: 0, replies: 0, found: false };
        }
    }

    /**
     * Update engagement for a comment
     */
    async updateCommentEngagement(commentId, likes, replies, found) {
        const updateData = {
            likes_count: likes,
            replies_count: replies,
            last_engagement_check: new Date().toISOString(),
        };

        // If comment wasn't found, mark as possibly hidden
        if (!found) {
            updateData.status = 'hidden';
        }

        await this.supabase
            .from('posted_comments')
            .update(updateData)
            .eq('id', commentId);
    }

    /**
     * Update quality scores for all target accounts
     */
    async updateQualityScores() {
        console.log('[EngagementTracker] Updating quality scores...');

        try {
            await this.supabase.rpc('update_target_quality_scores');
            console.log('[EngagementTracker] Quality scores updated');
        } catch (error) {
            console.error('[EngagementTracker] Error updating scores:', error.message);
        }
    }

    /**
     * Run a full engagement check
     */
    async runCheck() {
        console.log(`[EngagementTracker] Starting engagement check at ${new Date().toISOString()}`);

        const comments = await this.getCommentsToCheck();

        if (comments.length === 0) {
            console.log('[EngagementTracker] No comments to check');
            return;
        }

        // Initialize a bot for scraping (using system account or guest mode)
        let bot = null;

        try {
            bot = new this.InstagramAutomation('system_scraper');
            await bot.init();

            // Process each comment
            for (const comment of comments) {
                const engagement = await this.scrapeCommentEngagement(bot, comment);
                await this.updateCommentEngagement(
                    comment.id,
                    engagement.likes,
                    engagement.replies,
                    engagement.found
                );

                // Small delay between checks
                await new Promise(r => setTimeout(r, 2000));
            }

            await bot.close();

        } catch (error) {
            console.error('[EngagementTracker] Check error:', error.message);
            if (bot) {
                try { await bot.close(); } catch (e) {}
            }
        }

        // Update quality scores after checking
        await this.updateQualityScores();

        console.log(`[EngagementTracker] Check complete. Processed ${comments.length} comments.`);
    }

    /**
     * Start the tracker
     */
    start() {
        if (this.isRunning) {
            console.log('[EngagementTracker] Already running');
            return;
        }

        console.log('[EngagementTracker] Starting tracker...');

        this.isRunning = true;
        this.intervalId = setInterval(() => this.runCheck(), CHECK_INTERVAL_MS);

        // Run initial check after 5 minutes (let system warm up)
        setTimeout(() => this.runCheck(), 5 * 60 * 1000);

        console.log('[EngagementTracker] Tracker started (checks every 4 hours)');
    }

    /**
     * Stop the tracker
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[EngagementTracker] Tracker stopped');
    }

    /**
     * Manually trigger a check (for testing)
     */
    async triggerManual() {
        console.log('[EngagementTracker] Manual trigger');
        await this.runCheck();
    }
}

module.exports = { EngagementTracker };
