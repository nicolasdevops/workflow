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

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const typingDelay = gaussianRandom(150, 50); // 150ms ± 50ms per character

    // 3% chance of typo
    if (Math.random() < 0.03 && i < text.length - 1) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await page.keyboard.type(wrongChar);
      await page.waitForTimeout(gaussianRandom(200, 100));
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(gaussianRandom(150, 50));
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
  constructor(cookies, userAgent = null) {
    this.cookies = cookies;
    this.userAgent = userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('Initializing browser...');
    this.browser = await firefox.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
      ]
    });

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
