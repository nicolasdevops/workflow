/**
 * Instagram Account Warm-Up Scheduler
 *
 * 14-day progressive warm-up to establish account trust before
 * adding fundraising links and starting comment automation.
 *
 * Phase 1 (Days 1-7): Silent observation
 *   - 5-10 min browsing with natural pauses
 *   - 5-10 likes on random content
 *   - 2-4 follows of neutral accounts (travel, food, nature)
 *   - NO comments, NO Gaza content
 *
 * Phase 2 (Days 8-14): Light engagement
 *   - Follow 3-5 humanitarian/Gaza accounts
 *   - Like posts from those accounts
 *   - 1-2 generic supportive comments (no links)
 *
 * Day 15+: Full activation
 *   - Add fundraising link to bio
 *   - Enable comment automation
 *   - Mark account as 'active'
 *
 * Bandwidth: ~7.5MB per warm-up session (with Data Saver mode)
 */

const { InstagramAutomation, gaussianRandom } = require('./instagram-automation');
const { decrypt } = require('./encryption');

/**
 * Neutral accounts to follow during Phase 1
 * Travel, food, nature, lifestyle - nothing political
 */
const NEUTRAL_ACCOUNTS = [
  'natgeo',
  'beautifuldestinations',
  'earthpix',
  'discoverearth',
  'wonderful_places',
  'food52',
  'thefeedfeed',
  'buzzfeedtasty',
  'minimalistbaker',
  'plantifulsoul',
  'unsplash',
  'adobe',
  'canva',
  'pinterest',
  'etsy'
];

/**
 * Humanitarian/Gaza-adjacent accounts for Phase 2
 * (Less aggressive than full comment targets)
 */
const HUMANITARIAN_ACCOUNTS = [
  'unicef',
  'wfp',
  'unhcr',
  'doctorswithoutborders',
  'savethechildren',
  'amnesty',
  'redcross',
  'unrwa'
];

/**
 * Generic supportive comments for Phase 2 (no links, no urgency)
 * Simple, heartfelt, low-risk
 */
const PHASE2_COMMENTS = [
  'Praying for everyone affected 🙏',
  'So important. Thank you for sharing.',
  'This breaks my heart 💔',
  'We must never forget.',
  'Sending love and strength ❤️',
  'Thank you for bringing attention to this.',
  'Humanity needs more of this.',
  'So grateful for this work.',
  'May peace prevail 🕊️'
];

/**
 * Calculate which warm-up day an account is on
 * @param {string} createdAt - ISO timestamp of account creation
 * @returns {number} Day number (1-indexed), or 0 if not created yet
 */
function getWarmupDay(createdAt) {
  if (!createdAt) return 0;

  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now - created;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays + 1; // Day 1 = creation day
}

/**
 * Get warm-up phase based on day number
 * @param {number} day - Current warm-up day
 * @returns {string} Phase: 'silent', 'engagement', 'active', or 'pending'
 */
function getWarmupPhase(day) {
  if (day === 0) return 'pending';
  if (day <= 7) return 'silent';
  if (day <= 14) return 'engagement';
  return 'active';
}

/**
 * Execute Phase 1: Silent observation
 * Natural browsing behavior without any engagement that could flag the account
 *
 * @param {InstagramAutomation} bot - Initialized automation instance
 * @param {number} day - Current warm-up day (1-7)
 */
async function executePhase1(bot, day) {
  console.log(`   Phase 1 (Day ${day}): Silent observation mode`);

  // Navigate to Instagram home
  await bot.page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await bot.page.waitForTimeout(gaussianRandom(3000, 1000));

  // Handle any popups/consent
  await dismissPopups(bot.page);

  // 1. Natural browsing (5-10 minutes, scaled by day)
  // Earlier days = shorter sessions (building up)
  const baseDuration = 5 * 60 * 1000; // 5 minutes
  const extraDuration = (day - 1) * 30 * 1000; // +30s per day
  const scrollDuration = Math.min(baseDuration + extraDuration, 10 * 60 * 1000);

  console.log(`   Browsing feed for ${Math.round(scrollDuration / 60000)} minutes...`);
  await naturalBrowse(bot, scrollDuration);

  // 2. Like some posts (5-10, scaling with day)
  const likeCount = Math.min(5 + day, 10);
  console.log(`   Liking ${likeCount} posts...`);
  await likeRandomFeedPosts(bot, likeCount);

  // 3. Follow neutral accounts (2-4 across the week)
  // Only on certain days to avoid pattern
  if (day === 1 || day === 3 || day === 5 || day === 7) {
    const followCount = Math.floor(Math.random() * 2) + 1; // 1-2 per session
    console.log(`   Following ${followCount} neutral accounts...`);
    await followNeutralAccounts(bot, followCount);
  }

  // 4. Maybe visit Explore page (realistic behavior)
  if (Math.random() > 0.5) {
    console.log(`   Visiting Explore page...`);
    await visitExplorePage(bot);
  }

  console.log(`   Phase 1 complete for day ${day}`);
}

/**
 * Execute Phase 2: Light engagement
 * Start engaging with humanitarian content
 *
 * @param {InstagramAutomation} bot - Initialized automation instance
 * @param {number} day - Current warm-up day (8-14)
 */
async function executePhase2(bot, day) {
  console.log(`   Phase 2 (Day ${day}): Light engagement mode`);

  // Navigate to Instagram home
  await bot.page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await bot.page.waitForTimeout(gaussianRandom(3000, 1000));
  await dismissPopups(bot.page);

  // 1. Browse feed naturally (7-10 minutes)
  const scrollDuration = gaussianRandom(8 * 60 * 1000, 60 * 1000);
  console.log(`   Browsing feed for ${Math.round(scrollDuration / 60000)} minutes...`);
  await naturalBrowse(bot, scrollDuration);

  // 2. Like posts (8-12)
  const likeCount = Math.floor(gaussianRandom(10, 2));
  console.log(`   Liking ${likeCount} posts...`);
  await likeRandomFeedPosts(bot, likeCount);

  // 3. Follow humanitarian accounts (1-2 per session)
  if (day === 8 || day === 10 || day === 12 || day === 14) {
    const followCount = Math.floor(Math.random() * 2) + 1;
    console.log(`   Following ${followCount} humanitarian accounts...`);
    await followHumanitarianAccounts(bot, followCount);
  }

  // 4. Post ONE generic comment (50% chance, days 10+)
  if (day >= 10 && Math.random() > 0.5) {
    console.log(`   Posting a supportive comment...`);
    await postGenericSupportiveComment(bot);
  }

  console.log(`   Phase 2 complete for day ${day}`);
}

/**
 * Dismiss Instagram popups (cookie consent, notifications, etc.)
 */
async function dismissPopups(page) {
  for (let i = 0; i < 3; i++) {
    try {
      // Cookie consent
      const declineBtn = await page.$('button:has-text("Decline optional cookies"), button:has-text("Decline")');
      if (declineBtn && await declineBtn.isVisible()) {
        await declineBtn.click();
        await page.waitForTimeout(1000);
      }

      // Close (X) buttons
      const closeButton = await page.$('svg[aria-label="Close"]');
      if (closeButton && await closeButton.isVisible()) {
        await closeButton.click();
        await page.waitForTimeout(1000);
      }

      // "Not Now" buttons (notifications, etc)
      const notNowBtn = await page.$('button:has-text("Not Now"), button:has-text("Not now")');
      if (notNowBtn && await notNowBtn.isVisible()) {
        await notNowBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      // Ignore popup dismissal errors
    }
    await page.waitForTimeout(500);
  }
}

/**
 * Natural browsing with variable scroll speeds and pauses
 * Mimics a real user reading content
 */
async function naturalBrowse(bot, duration) {
  const endTime = Date.now() + duration;

  while (Date.now() < endTime) {
    // Scroll a variable distance
    const scrollDistance = gaussianRandom(250, 100);
    await bot.page.evaluate((dist) => window.scrollBy(0, dist), scrollDistance);

    // Pause to "read" (longer pauses for realism)
    const pauseDuration = gaussianRandom(3000, 1500);
    await bot.page.waitForTimeout(pauseDuration);

    // Occasionally pause longer (as if really engaged with content)
    if (Math.random() > 0.85) {
      const longPause = gaussianRandom(8000, 3000);
      await bot.page.waitForTimeout(longPause);
    }

    // Occasionally scroll back up slightly (natural behavior)
    if (Math.random() > 0.9) {
      const scrollBack = gaussianRandom(100, 50);
      await bot.page.evaluate((dist) => window.scrollBy(0, -dist), scrollBack);
      await bot.page.waitForTimeout(gaussianRandom(1500, 500));
    }
  }
}

/**
 * Like random posts currently visible in the feed
 */
async function likeRandomFeedPosts(bot, count) {
  try {
    // Find all like buttons (heart icons that aren't already liked)
    const likeButtons = await bot.page.$$('svg[aria-label="Like"][width="24"]');
    const shuffled = likeButtons.sort(() => Math.random() - 0.5);
    const toLike = shuffled.slice(0, Math.min(count, likeButtons.length));

    for (const button of toLike) {
      try {
        // Scroll element into view
        await button.scrollIntoViewIfNeeded();
        await bot.page.waitForTimeout(gaussianRandom(1000, 500));

        // Click with slight offset (human imprecision)
        await button.click();
        await bot.page.waitForTimeout(gaussianRandom(2000, 800));
      } catch (e) {
        // Skip if button became stale
      }
    }
  } catch (e) {
    console.log(`   Could not like posts: ${e.message}`);
  }
}

/**
 * Follow neutral accounts (Phase 1)
 */
async function followNeutralAccounts(bot, count) {
  const shuffled = NEUTRAL_ACCOUNTS.sort(() => Math.random() - 0.5);
  const toFollow = shuffled.slice(0, count);

  for (const username of toFollow) {
    try {
      await followAccount(bot, username);
      await bot.page.waitForTimeout(gaussianRandom(5000, 2000));
    } catch (e) {
      console.log(`   Could not follow @${username}: ${e.message}`);
    }
  }
}

/**
 * Follow humanitarian accounts (Phase 2)
 */
async function followHumanitarianAccounts(bot, count) {
  const shuffled = HUMANITARIAN_ACCOUNTS.sort(() => Math.random() - 0.5);
  const toFollow = shuffled.slice(0, count);

  for (const username of toFollow) {
    try {
      await followAccount(bot, username);
      await bot.page.waitForTimeout(gaussianRandom(5000, 2000));
    } catch (e) {
      console.log(`   Could not follow @${username}: ${e.message}`);
    }
  }
}

/**
 * Follow a specific account
 */
async function followAccount(bot, username) {
  console.log(`   Following @${username}...`);

  await bot.page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
  await bot.page.waitForTimeout(gaussianRandom(2000, 1000));
  await dismissPopups(bot.page);

  // Find Follow button
  const followBtn = await bot.page.$('button:has-text("Follow"):not(:has-text("Following"))');
  if (followBtn) {
    await followBtn.click();
    await bot.page.waitForTimeout(gaussianRandom(1500, 500));
    console.log(`   ✓ Followed @${username}`);
  } else {
    console.log(`   Already following @${username} or button not found`);
  }
}

/**
 * Visit Explore page and browse naturally
 */
async function visitExplorePage(bot) {
  await bot.page.goto('https://www.instagram.com/explore/', { waitUntil: 'domcontentloaded' });
  await bot.page.waitForTimeout(gaussianRandom(2000, 1000));
  await dismissPopups(bot.page);

  // Browse for 1-2 minutes
  const browseDuration = gaussianRandom(90 * 1000, 30 * 1000);
  await naturalBrowse(bot, browseDuration);
}

/**
 * Post a generic supportive comment on a humanitarian account's latest post
 */
async function postGenericSupportiveComment(bot) {
  const account = HUMANITARIAN_ACCOUNTS[Math.floor(Math.random() * HUMANITARIAN_ACCOUNTS.length)];
  const comment = PHASE2_COMMENTS[Math.floor(Math.random() * PHASE2_COMMENTS.length)];

  console.log(`   Commenting on @${account}: "${comment}"`);

  try {
    // Navigate to account
    await bot.page.goto(`https://www.instagram.com/${account}/`, { waitUntil: 'domcontentloaded' });
    await bot.page.waitForTimeout(gaussianRandom(2000, 1000));
    await dismissPopups(bot.page);

    // Click first post
    const firstPost = await bot.page.$('main a[href*="/p/"], main a[href*="/reel/"]');
    if (!firstPost) {
      console.log(`   No posts found on @${account}`);
      return;
    }

    const postUrl = await firstPost.getAttribute('href');
    await bot.page.goto(`https://www.instagram.com${postUrl}`, { waitUntil: 'domcontentloaded' });
    await bot.page.waitForTimeout(gaussianRandom(3000, 1000));
    await dismissPopups(bot.page);

    // "Read" the post first
    await bot.page.waitForTimeout(gaussianRandom(5000, 2000));

    // Find comment input
    const commentInput = await bot.page.$('textarea[aria-label*="comment"], textarea[placeholder*="comment"]');
    if (!commentInput) {
      console.log(`   Comment input not found (may require login)`);
      return;
    }

    // Type comment with human behavior (using existing humanType)
    await commentInput.click();
    await bot.page.waitForTimeout(gaussianRandom(500, 200));

    // Type character by character
    for (const char of comment) {
      await bot.page.keyboard.type(char);
      await bot.page.waitForTimeout(gaussianRandom(100, 50));
    }

    await bot.page.waitForTimeout(gaussianRandom(1500, 500));

    // Click post button
    const postBtn = await bot.page.$('button[type="submit"], div[role="button"]:has-text("Post")');
    if (postBtn) {
      await postBtn.click();
      await bot.page.waitForTimeout(gaussianRandom(3000, 1000));
      console.log(`   ✓ Comment posted`);
    }
  } catch (e) {
    console.log(`   Could not post comment: ${e.message}`);
  }
}

/**
 * Run warm-up session for a single family
 *
 * @param {Object} family - Family record from Supabase
 * @param {Object} supabase - Supabase client
 * @returns {Object} Result with status and details
 */
async function runWarmupSession(family, supabase) {
  const day = getWarmupDay(family.ig_account_created_at);
  const phase = getWarmupPhase(day);

  console.log(`\n=== Warm-up Session: ${family.name || family.id} ===`);
  console.log(`   Account: @${family.ig_username}`);
  console.log(`   Day: ${day}, Phase: ${phase}`);

  // Skip if not in warm-up phase
  if (phase === 'pending') {
    console.log(`   Skipped: Account not yet created`);
    return { status: 'skipped', reason: 'pending' };
  }

  if (phase === 'active') {
    console.log(`   Skipped: Account already active (day ${day})`);
    // Update status if not already active
    if (family.ig_account_status !== 'active') {
      await supabase
        .from('families')
        .update({ ig_account_status: 'active' })
        .eq('id', family.id);
    }
    return { status: 'skipped', reason: 'already_active' };
  }

  // Decrypt cookies
  let cookies;
  try {
    if (!family.cookies) {
      console.log(`   Error: No cookies stored for this family`);
      return { status: 'error', reason: 'no_cookies' };
    }

    let encryptedData = family.cookies;
    if (typeof encryptedData === 'string') encryptedData = JSON.parse(encryptedData);
    cookies = JSON.parse(decrypt(encryptedData));
  } catch (e) {
    console.log(`   Error decrypting cookies: ${e.message}`);
    return { status: 'error', reason: 'decrypt_failed' };
  }

  // Prepare location config
  const locationConfig = {
    proxy_city: family.proxy_city,
    proxy_country: family.proxy_country,
    timezone: family.timezone,
    geo_latitude: family.geo_latitude,
    geo_longitude: family.geo_longitude
  };

  // Initialize bot
  const sessionId = `warmup-${family.ig_username}-day${day}`;
  const bot = new InstagramAutomation(cookies, null, { server: 'proxy' }, sessionId, locationConfig);

  try {
    await bot.init();

    // Execute appropriate phase
    if (phase === 'silent') {
      await executePhase1(bot, day);
    } else if (phase === 'engagement') {
      await executePhase2(bot, day);
    }

    // Update account status
    const newStatus = phase === 'silent' ? 'warming_up' : 'warming_up';
    await supabase
      .from('families')
      .update({
        ig_account_status: newStatus,
        last_warmup_at: new Date().toISOString(),
        warmup_day: day
      })
      .eq('id', family.id);

    console.log(`   Session complete. Updated status to '${newStatus}'`);
    return { status: 'success', day, phase };

  } catch (e) {
    console.error(`   Warm-up error: ${e.message}`);
    return { status: 'error', reason: e.message };
  } finally {
    await bot.close();
  }
}

/**
 * Run warm-up for all families in warming phase
 *
 * @param {Object} supabase - Supabase client
 */
async function runAllWarmups(supabase) {
  console.log('\n🔥 WARM-UP SCHEDULER: Starting daily warm-up run...');

  // Get all families with created accounts that aren't fully active yet
  // SAFETY: Only run for families where bestbehavior_enabled = true
  const { data: families, error } = await supabase
    .from('families')
    .select('*')
    .eq('bestbehavior_enabled', true)
    .in('ig_account_status', ['created', 'warming_up'])
    .not('ig_account_created_at', 'is', null);

  if (error) {
    console.error('Failed to fetch families:', error.message);
    return;
  }

  if (!families || families.length === 0) {
    console.log('No families currently in warm-up phase');
    return;
  }

  console.log(`Found ${families.length} families to warm up`);

  // Process each family sequentially (avoid parallel proxy sessions)
  for (const family of families) {
    try {
      await runWarmupSession(family, supabase);

      // Random delay between families (5-15 minutes)
      // This spreads load and looks more natural
      const delayMs = gaussianRandom(10 * 60 * 1000, 3 * 60 * 1000);
      console.log(`   Waiting ${Math.round(delayMs / 60000)} minutes before next family...`);
      await new Promise(r => setTimeout(r, delayMs));

    } catch (e) {
      console.error(`Error warming up family ${family.id}: ${e.message}`);
    }
  }

  console.log('🔥 WARM-UP SCHEDULER: Daily run complete\n');
}

module.exports = {
  getWarmupDay,
  getWarmupPhase,
  runWarmupSession,
  runAllWarmups,
  executePhase1,
  executePhase2,
  NEUTRAL_ACCOUNTS,
  HUMANITARIAN_ACCOUNTS,
  PHASE2_COMMENTS
};
