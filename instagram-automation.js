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
  const typoIndex = text.length > 4 ? Math.floor(Math.random() * (text.length - 2)) + 1 : -1;

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

  const startHour = parseInt(process.env.OPERATION_START_HOUR || 8);
  const endHour = parseInt(process.env.OPERATION_END_HOUR || 18);

  return hour >= startHour && hour < endHour;
}

class InstagramAutomation {
  constructor(cookies = [], userAgent = null) {
    this.cookies = cookies;
    this.userAgent = userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('Initializing browser...');
    this.browser = await firefox.launch({
      headless: false
    });
    console.log('   Browser launched. Creating context...');

    const context = await this.browser.newContext({
      userAgent: this.userAgent,
      viewport: { width: 375, height: 812 }, // iPhone viewport
      locale: 'en-US',
      timezoneId: 'Asia/Gaza',
      geolocation: { longitude: 34.4668, latitude: 31.5017 }, // Gaza coordinates
      permissions: ['geolocation']
    });

    // Add cookies
    if (this.cookies) {
      await context.addCookies(this.cookies);
    }

    console.log('   Context created. Opening page...');
    this.page = await context.newPage();

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
    console.log('Scrolling feed naturally...');
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

  async postGenericComment() {
    const genericComments = [
      'Free Palestine 🇵🇸❤️',
      'From the river to the sea 🇵🇸',
      'Justice for Palestine 🕊️',
      'We stand with Gaza 💚❤️',
      'Free free Palestine 🇵🇸🇵🇸',
      'Palestine will be free 🕊️🇵🇸',
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
      await this.page.waitForTimeout(gaussianRandom(2000, 1000));

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
      return { status: 'SUCCESS', cookies };

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
