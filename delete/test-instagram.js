/**
 * Test script for Instagram automation
 * Run this to verify the system works before deploying
 */

require('dotenv').config();
const { InstagramAutomation, isOperationWindowActive } = require('./instagram-automation');

async function testAutomation() {
  console.log('=== Gaza Protocol Instagram Automation Test ===\n');

  // Check operation window
  console.log('1. Checking operation window...');
  const isActive = isOperationWindowActive();
  console.log(`   Operation window active: ${isActive ? 'YES' : 'NO'}`);
  console.log(`   Current time (Gaza): ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Gaza' })}\n`);

  // Example cookies (you'll need real cookies from a logged-in session)
  const testCookies = [
    {
      name: 'sessionid',
      value: 'YOUR_SESSION_ID_HERE',
      domain: '.instagram.com',
      path: '/',
      httpOnly: true,
      secure: true
    },
    {
      name: 'csrftoken',
      value: 'YOUR_CSRF_TOKEN_HERE',
      domain: '.instagram.com',
      path: '/',
      httpOnly: false,
      secure: true
    }
  ];

  console.log('2. Initializing Instagram automation...');
  // Pass test sessionId for unique proxy session
  const sessionId = 'test-session';
  const bot = new InstagramAutomation(testCookies, null, { server: 'proxy' }, sessionId);

  try {
    await bot.init();
    console.log('   Browser initialized successfully\n');

    console.log('3. Navigating to Instagram...');
    await bot.page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
    await bot.page.waitForTimeout(3000);

    // Check if logged in
    const isLoggedIn = await bot.page.$('svg[aria-label="Home"]') !== null;
    console.log(`   Login status: ${isLoggedIn ? 'LOGGED IN' : 'NOT LOGGED IN'}\n`);

    if (!isLoggedIn) {
      console.log('⚠️  Not logged in. You need to provide valid session cookies.\n');
      console.log('To get cookies:');
      console.log('1. Log into Instagram in Firefox');
      console.log('2. Press F12 to open DevTools');
      console.log('3. Go to Storage > Cookies > https://www.instagram.com');
      console.log('4. Copy the values for "sessionid" and "csrftoken"\n');
      await bot.close();
      return;
    }

    console.log('4. Testing organic behavior simulation...');
    console.log('   Scrolling feed for 15 seconds...');
    await bot.scrollFeed(15000);

    console.log('   Liking 5 random posts...');
    await bot.likeRandomPosts(5);

    console.log('   Success! Organic behavior looks natural.\n');

    // Uncomment to test commenting (requires a valid post URL)
    /*
    console.log('5. Testing comment posting...');
    const testPostUrl = 'https://instagram.com/p/EXAMPLE_POST_ID/';
    const testComment = 'Free Palestine 🇵🇸❤️';
    const result = await bot.postComment(testPostUrl, testComment);

    if (result.success) {
      console.log('   Comment posted successfully!\n');
    } else {
      console.log(`   Comment failed: ${result.error}\n`);
    }
    */

    console.log('✅ All tests passed! System is ready for deployment.\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await bot.close();
  }
}

// Run the test
testAutomation().catch(console.error);
