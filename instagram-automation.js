const { firefox } = require('playwright');

/**
 * Gaza Protocol Instagram Automation
 * Human-like behavior simulation for comment posting
 */

// Gaussian random number generator
function gaussianRandom(mean, stdev) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, z0 * stdev + mean);
}

// Simulate human typing with occasional typos and corrections
async function humanType(page, selector, text) {
  await page.click(selector);

  // Force exactly one typo for realism if text is long enough
  // Randomize position: anywhere from 2nd character to the end
  const typoIndex = text.length > 3 ? Math.floor(Math.random() * (text.length - 1)) + 1 : -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const typingDelay = gaussianRandom(150, 50); // 150ms ± 50ms per character

    // Execute typo at the chosen index
    if (i === typoIndex) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await page.keyboard.type(wrongChar);
      await page.waitForTimeout(gaussianRandom(300, 150)); // Pause to realize mistake
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(gaussianRandom(200, 100)); // Pause before correcting
    }

    await page.keyboard.type(char);
    await page.waitForTimeout(typingDelay);
  }
}

// Simulate human mouse movement with bezier curves
async function humanMouseMove(page, x, y) {
  const currentPos = await page.evaluate(() => ({
    x: window.mouseX || 0,
    y: window.mouseY || 0
  }));

  // Simple bezier approximation - move in curved path
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const newX = currentPos.x + (x - currentPos.x) * progress;
    const newY = currentPos.y + (y - currentPos.y) * progress;

    await page.mouse.move(newX, newY);
    await page.waitForTimeout(gaussianRandom(10, 5));
  }
}

// Check if operation window is active (8 AM - 6 PM Gaza time)
function isOperationWindowActive() {
  const now = new Date();
  const gazaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Gaza' }));
  const hour = gazaTime.getHours();

  // User requested flexible hours based on key events rather than fixed window
  // We still return true to allow the script to run, but logic is now handled by the scheduler
  return true; 
}

class InstagramAutomation {
  constructor(cookies = [], userAgent = null, proxy = null) {
    this.cookies = cookies;
    // Use Desktop User Agent to avoid "Get the App" redirects and allow Guest Mode
    this.userAgent = userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
    this.proxy = proxy;
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('Initializing browser...');
    // Use env var to control headless mode (default true in production/railway)
    const isHeadless = process.env.HEADLESS !== 'false';

    const launchOptions = {
      headless: isHeadless,
      firefoxUserPrefs: {
        'privacy.trackingprotection.enabled': true,
        'privacy.donottrackheader.enabled': true
      }
    };

    if (this.proxy && this.proxy.server) {
      console.log(`Using proxy: ${this.proxy.server}`);
      launchOptions.proxy = this.proxy;
    }

    this.browser = await firefox.launch(launchOptions);
    console.log('   Browser launched. Creating context...');

    // Use timezone that matches proxy location (default to Toronto/Canada for safety)
    // This prevents Instagram from detecting Gaza location
    const timezone = process.env.TIMEZONE || 'America/Toronto';

    const context = await this.browser.newContext({
      userAgent: this.userAgent,
      viewport: { width: 1280, height: 800 }, // Desktop viewport
      locale: 'en-US',
      timezoneId: timezone,
      permissions: ['geolocation'],
      geolocation: {
        latitude: 43.6532,
        longitude: -79.3832
      } // Toronto coordinates - change to match proxy location
    });

    // Add cookies
    if (this.cookies) {
      await context.addCookies(this.cookies);
    }

    console.log('   Context created. Opening page...');
    this.page = await context.newPage();

    // Enable bandwidth optimization (Data Saver mode)
    // This is legitimate Instagram behavior for users on limited data
    await this.page.route('**/*', (route) => {
      const request = route.request();
      const headers = request.headers();

      // Add Instagram's Data Saver headers (signals low-bandwidth mode)
      headers['X-IG-Bandwidth-Speed-KBPS'] = '500'; // Simulate slow connection
      headers['X-IG-Bandwidth-TotalBytes-B'] = '0';
      headers['X-IG-Bandwidth-TotalTime-MS'] = '0';

      // Block unnecessary resources to save bandwidth
      const resourceType = request.resourceType();
      const url = request.url();

      // Allow essential resources
      if (
        resourceType === 'document' || // HTML pages
        resourceType === 'xhr' || // API calls
        resourceType === 'fetch' || // Modern API calls
        url.includes('graphql') || // Instagram API
        url.includes('/api/') // API endpoints
      ) {
        route.continue({ headers });
      }
      // Block analytics, tracking, ads (saves bandwidth + looks privacy-conscious)
      else if (
        url.includes('facebook.com/tr') ||
        url.includes('google-analytics') ||
        url.includes('/ads/') ||
        url.includes('doubleclick')
      ) {
        route.abort();
      }
      // Allow compressed images and videos but with quality reduction hint
      else if (resourceType === 'image' || resourceType === 'media') {
        headers['Save-Data'] = 'on'; // Standard HTTP header for data saver
        route.continue({ headers });
      }
      // Allow scripts and styles (needed for functionality)
      else if (resourceType === 'script' || resourceType === 'stylesheet') {
        route.continue({ headers });
      }
      // Block fonts, WebSockets (not essential, saves data)
      else if (resourceType === 'font' || resourceType === 'websocket') {
        route.abort();
      }
      // Allow everything else with data saver headers
      else {
        route.continue({ headers });
      }
    });

    // Anti-detection measures
    await this.page.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Mock touch support
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 5
      });
    });

    console.log('Browser initialized');
  }

  async scrollFeed(duration = 30000) {
    // Bandwidth consideration: Shorter scrolling = less video auto-play data
    // With Data Saver mode enabled, 30s scroll uses ~8MB instead of ~50MB
    // Adjust duration lower if using limited proxy bandwidth (1-2GB/month)
    console.log(`Scrolling feed naturally for ${duration/1000}s...`);
    const endTime = Date.now() + duration;

    while (Date.now() < endTime) {
      // Random scroll distance
      const scrollDistance = gaussianRandom(300, 100);
      await this.page.evaluate((distance) => {
        window.scrollBy(0, distance);
      }, scrollDistance);

      // Pause to "read" content
      await this.page.waitForTimeout(gaussianRandom(2000, 1000));
    }
  }

  async likeRandomPosts(count = 20) {
    console.log(`Liking ${count} random posts...`);

    try {
      const likeButtons = await this.page.$$('[aria-label="Like"]');
      const shuffled = likeButtons.sort(() => Math.random() - 0.5);
      const toLike = shuffled.slice(0, Math.min(count, likeButtons.length));

      for (const button of toLike) {
        await button.click();
        await this.page.waitForTimeout(gaussianRandom(1500, 500));
      }

      console.log(`Liked ${toLike.length} posts`);
    } catch (error) {
      console.log('Error liking posts:', error.message);
    }
  }

  async likeRandomComments(count = 12) {
    console.log(`Liking ${count} random comments...`);

    try {
      // Scroll to comments section
      await this.page.evaluate(() => {
        const commentsSection = document.querySelector('[aria-label*="Comment"]');
        if (commentsSection) commentsSection.scrollIntoView();
      });

      await this.page.waitForTimeout(gaussianRandom(1000, 500));

      const commentLikeButtons = await this.page.$$('button[aria-label="Like"]');
      const shuffled = commentLikeButtons.sort(() => Math.random() - 0.5);
      const toLike = shuffled.slice(0, Math.min(count, commentLikeButtons.length));

      for (const button of toLike) {
        await button.click();
        await this.page.waitForTimeout(gaussianRandom(1200, 400));
      }

      console.log(`Liked ${toLike.length} comments`);
    } catch (error) {
      console.log('Error liking comments:', error.message);
    }
  }

  async postComment(postUrl, commentText) {
    console.log(`Navigating to post: ${postUrl}`);

    try {
      await this.page.goto(postUrl, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(gaussianRandom(3000, 1000));

      // Scroll to read caption
      await this.page.evaluate(() => window.scrollBy(0, 200));
      await this.page.waitForTimeout(gaussianRandom(4000, 2000)); // Simulate reading

      // Find comment textarea
      const commentSelector = 'textarea[aria-label*="comment"], textarea[placeholder*="comment"]';
      await this.page.waitForSelector(commentSelector, { timeout: 10000 });

      // Type comment with human-like behavior
      await humanType(this.page, commentSelector, commentText);

      // Wait before posting
      await this.page.waitForTimeout(gaussianRandom(2000, 1000));

      // Click post button
      const postButtonSelector = 'button[type="submit"], button:has-text("Post")';
      await this.page.click(postButtonSelector);

      // Wait for confirmation
      await this.page.waitForTimeout(gaussianRandom(3000, 1000));

      // Check for errors
      const errorVisible = await this.page.$('text=/error|try again|wait/i');
      if (errorVisible) {
        const errorText = await errorVisible.textContent();
        throw new Error(`Instagram error: ${errorText}`);
      }

      console.log('Comment posted successfully');
      return { success: true, error: null };

    } catch (error) {
      console.error('Error posting comment:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a Direct Message to a user
   */
  async sendDirectMessage(username, message) {
    console.log(`Sending DM to ${username}...`);
    try {
      // Go to profile
      await this.page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(gaussianRandom(3000, 1000));

      // Click Message button
      // Note: Selectors vary between accounts, trying common ones
      const messageBtnSelectors = [
        'div[role="button"]:has-text("Message")',
        'button:has-text("Message")'
      ];
      
      let messageBtn = null;
      for (const sel of messageBtnSelectors) {
        messageBtn = await this.page.$(sel);
        if (messageBtn) break;
      }

      if (!messageBtn) throw new Error('Message button not found (account may be private or restricted)');
      
      await messageBtn.click();
      await this.page.waitForTimeout(gaussianRandom(4000, 2000));

      // Wait for chat input
      const inputSelector = 'div[contenteditable="true"][role="textbox"]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });
      
      // Type and send
      await humanType(this.page, inputSelector, message);
      await this.page.waitForTimeout(gaussianRandom(1000, 500));
      await this.page.keyboard.press('Enter');
      
      console.log('DM sent successfully');
      return { success: true };

    } catch (error) {
      console.error('Error sending DM:', error.message);
      return { success: false, error: error.message };
    }
  }

  async postGenericComment() {
    const genericComments = [
      'PALESTINE IN MY HEART!!!! ❤️❤️❤️🇵🇸❤️',
      'From the river to the sea yeah? Yeah? Get it??✊🏻✊🏻✊🏻✊🏻🇵🇸😘🙈',
      'Justice for Palestine!!!! ✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻✊🏻🕊️',
      'GAZA MY LOVE!!! 😭🩸💥✊🏻✊🏻✊🏻',
      'FREEDOM!!!!! ❤️❤️❤️❤️❤️❤️🇵🇸🇵🇸🌌🌌🌠🌠🌟🌟',
      'AMEEN FOR FELESTEEN!! 🙈✊🏻💥❤️🙏🏻🕊️✊🏻🌎🕊️',
    ];

    const comment = genericComments[Math.floor(Math.random() * genericComments.length)];

    // Find a random post on the feed
    try {
      const posts = await this.page.$$('article a[href*="/p/"]');
      if (posts.length > 0) {
        const randomPost = posts[Math.floor(Math.random() * Math.min(posts.length, 10))];
        const postUrl = await randomPost.getAttribute('href');
        const fullUrl = `https://instagram.com${postUrl}`;

        return await this.postComment(fullUrl, comment);
      }
    } catch (error) {
      console.log('Could not post generic comment:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check a target account for the latest post
   * Returns { url, timestamp, isFresh }
   */
  async getLatestPostInfo(targetUsername) {
    console.log(`Checking @${targetUsername} for new posts...`);
    try {
      await this.page.goto(`https://www.instagram.com/${targetUsername}/`, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(gaussianRandom(3000, 1000));
      
      // 1. Handle Cookie Consent (Decline)
      try {
        const declineBtn = await this.page.$('button:has-text("Decline optional cookies"), button:has-text("Decline")');
        if (declineBtn && await declineBtn.isVisible()) {
          console.log('   Cookie consent found. Clicking Decline...');
          await declineBtn.click();
          await this.page.waitForTimeout(1500);
        }
      } catch (e) {}

      // 2. Handle Popups (X button) - Check multiple times as they stack
      for (let i = 0; i < 5; i++) {
        try {
          const closeButton = await this.page.$('svg[aria-label="Close"]');
          if (closeButton && await closeButton.isVisible()) {
            console.log('   Detected popup (X). Closing...');
            await closeButton.click();
            await this.page.waitForTimeout(1000);
          }
        } catch (e) {}
        await this.page.waitForTimeout(500);
      }

      // Selector for the first post in the grid (most recent)
      // Updated to handle Guest Mode paths like /username/p/id inside main content
      const firstPostSelector = 'main a[href*="/p/"], main a[href*="/reel/"], article a[href*="/p/"], article a[href*="/reel/"]';
      
      try {
        await this.page.waitForSelector(firstPostSelector, { timeout: 30000 });
      } catch (e) {
        console.log('   Timeout waiting for post grid. Account might be private or layout changed.');
        return null;
      }
      
      // Get all post links and pick the first one (most recent)
      const posts = await this.page.$$(firstPostSelector);
      const firstPost = posts[0];
      
      if (!firstPost) return null;
      
      const postUrl = await firstPost.getAttribute('href');
      // Construct full URL (Guest mode links might include username prefix, which is valid)
      const fullUrl = `https://www.instagram.com${postUrl}`;
      
      // Navigate directly to post (Guest Mode fix)
      console.log(`   Navigating directly to post: ${fullUrl}`);
      await this.page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
      
      // Wait for content to load (Guest mode often loads skeleton first)
      try {
        await this.page.waitForSelector('article, main', { timeout: 15000 });
      } catch (e) {
        console.log('   Warning: Main content selector timeout');
      }
      await this.page.waitForTimeout(gaussianRandom(2000, 1000));
      
      // Handle popups on post page (Login wall, App upsell)
      for (let i = 0; i < 5; i++) {
        try {
          // Check for cookie consent on post page too
          const declineBtn = await this.page.$('button:has-text("Decline optional cookies"), button:has-text("Decline")');
          if (declineBtn && await declineBtn.isVisible()) {
            console.log('   Cookie consent found on post page. Clicking Decline...');
            await declineBtn.click();
            await this.page.waitForTimeout(1500);
          }

          const closeButton = await this.page.$('svg[aria-label="Close"]');
          if (closeButton && await closeButton.isVisible()) {
            console.log('   Detected popup on post page (X). Closing...');
            await closeButton.click();
            await this.page.waitForTimeout(1000);
          }
        } catch (e) {}
        await this.page.waitForTimeout(500);
      }

      // Attempt to expand caption (click "more")
      try {
        const moreButton = await this.page.$('span[role="button"]:has-text("more"), button:has-text("more")');
        if (moreButton) {
          console.log('   Expanding caption...');
          await moreButton.click();
          await this.page.waitForTimeout(1500);
        }
      } catch (e) {
        // Ignore expansion errors (button might not exist for short captions)
      }

      const timeElement = await this.page.$('time');
      const timestamp = timeElement ? await timeElement.getAttribute('datetime') : new Date().toISOString();
      
      // Extract caption for context
      let caption = '';
      try {
        // Try H1 (standard) and specific Span classes (Guest Mode)
        const captionSelector = 'h1, span.x193iq5w.xeuugli.x13faqbe.x1vvkbs.xt0psk2';
        
        // Wait for caption to render
        try {
            await this.page.waitForSelector(captionSelector, { timeout: 8000 });
        } catch (e) {}

        const captionEl = await this.page.$(captionSelector);
        if (captionEl) caption = await captionEl.textContent();
      } catch (e) {
        console.log('   Could not extract caption');
      }

      return {
        username: targetUsername,
        url: fullUrl,
        timestamp: timestamp,
        caption: caption
      };
    } catch (e) {
      console.log(`Error checking ${targetUsername}: ${e.message}`);
      return null;
    }
  }

  /**
   * Login with username and password to extract cookies
   */
  async loginWithCredentials(username, password) {
    console.log(`Attempting login for ${username}...`);
    
    try {
      console.log('1. Navigating to login page...');
      await this.page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle' });
      await this.page.waitForTimeout(gaussianRandom(2000, 1000));

      // Handle cookie consent if it appears
      console.log('2. Checking for cookie consent...');
      try {
        const cookieBtn = await this.page.$('button:has-text("Allow all cookies"), button:has-text("Accept")');
        if (cookieBtn) {
          console.log('   Cookie consent found. Clicking...');
          await cookieBtn.click();
          await this.page.waitForTimeout(1000);
        }
      } catch (e) {
        console.log('   Cookie check skipped:', e.message);
      }

      // Type credentials
      console.log('3. Waiting for username field...');
      await this.page.waitForSelector('input[name="username"]', { timeout: 15000 });

      console.log('4. Typing username...');
      await humanType(this.page, 'input[name="username"]', username);
      await this.page.waitForTimeout(gaussianRandom(1000, 500));
      
      console.log('5. Typing password...');
      await humanType(this.page, 'input[name="password"]', password);
      await this.page.waitForTimeout(gaussianRandom(2000, 1000));

      // Random hesitation before clicking login
      console.log('   Hesitating before login...');
      await this.page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);

      // Click login
      console.log('6. Clicking login button...');
      
      // Try multiple selectors (Standard Web vs Mobile/Bloks view)
      const loginSelectors = [
        'button[type="submit"]',
        'div[role="button"][aria-label="Log in"]',
        'div[role="button"]:has-text("Log in")'
      ];

      let clicked = false;
      for (const selector of loginSelectors) {
        const btn = await this.page.$(selector);
        if (btn) {
          console.log(`   Found login button: ${selector}`);
          await btn.click();
          clicked = true;
          break;
        }
      }
      
      if (!clicked) {
        console.log('   ⚠️ Login button not found. Attempting "Enter" key...');
        await this.page.keyboard.press('Enter');
      }

      console.log('7. Waiting for response...');
      await this.page.waitForTimeout(5000);

      // Check result
      console.log('8. Checking login status...');
      const isTwoFactor = await this.page.$('input[name="verificationCode"]');
      if (isTwoFactor) {
        console.log('   2FA Required.');
        return { status: '2FA_REQUIRED' };
      }

      const errorMsg = await this.page.$('p[id="slfErrorAlert"]');
      if (errorMsg) {
        const msg = await errorMsg.textContent();
        console.log(`   Login failed: ${msg}`);
        return { status: 'ERROR', message: msg };
      }

      // Check for successful login indicator (home icon, profile icon, etc)
      // Or just check if we are redirected
      // await this.page.waitForLoadState('networkidle');
      
      const cookies = await this.page.context().cookies();
      console.log(`   Success! Extracted ${cookies.length} cookies.`);

      // Extract profile picture
      let profilePicUrl = null;
      try {
        console.log('   Fetching profile picture...');
        await this.page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'networkidle' });
        // Try to find the profile image (usually in header)
        const img = await this.page.$('header img');
        if (img) {
            profilePicUrl = await img.getAttribute('src');
        }
      } catch (e) {
        console.log('   Could not fetch profile pic:', e.message);
      }

      return { status: 'SUCCESS', cookies, profilePicUrl };

    } catch (error) {
      console.error('Login error details:', error);
      // Try to take a screenshot for debugging
      try {
        await this.page.screenshot({ path: 'login_error.png' });
        console.log('   Saved screenshot to login_error.png');
      } catch (e) {}
      
      return { status: 'ERROR', message: error.message };
    }
  }

  /**
   * Submit 2FA code
   */
  async submitTwoFactorCode(code) {
    try {
      await humanType(this.page, 'input[name="verificationCode"]', code);
      await this.page.click('button:has-text("Confirm")');
      await this.page.waitForTimeout(5000);

      const errorMsg = await this.page.$('p[id="twoFactorErrorAlert"]');
      if (errorMsg) {
        return { status: 'ERROR', message: 'Invalid code' };
      }

      const cookies = await this.page.context().cookies();
      return { status: 'SUCCESS', cookies };
    } catch (error) {
      return { status: 'ERROR', message: error.message };
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('Browser closed');
    }
  }
}

module.exports = {
  InstagramAutomation,
  isOperationWindowActive,
  gaussianRandom
};
