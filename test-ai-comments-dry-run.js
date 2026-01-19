/**
 * Test Script: AI Comment Generation (Live Scrape Dry Run)
 * Scrapes actual latest posts from top accounts without logging in,
 * then generates comments using the AI agent.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { YouComAgent } = require('./youcom-agent');
const { InstagramAutomation } = require('./instagram-automation');

// Configuration
const TARGET_EMAIL = 'family@example.com'; // Ensure this matches a user in your DB

// Top 5 accounts to scrape (from your target list)
const TARGET_ACCOUNTS = [
  'eye.on.palestine',
  'unicef',
  'aljazeera',
  'doctorswithoutborders',
  'middleeastmonitor'
];

async function runDryRun() {
  console.log('🚀 Starting AI Comment Dry Run (Live Scrape / No Login)...\n');

  // 1. Initialize Supabase
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials in .env');
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // 2. Fetch Family Profile
  console.log(`🔍 Fetching profile for: ${TARGET_EMAIL}`);
  let { data: family, error } = await supabase
    .from('families')
    .select('*')
    .eq('email', TARGET_EMAIL)
    .single();

  // Fallback: If specific email not found, grab the most recently active one
  if (!family) {
      console.log(`⚠️ Target email ${TARGET_EMAIL} not found. Fetching most recent active family...`);
      const { data: fallbackFamily } = await supabase.from('families').select('*').order('created_at', { ascending: false }).limit(1).single();
      family = fallbackFamily;
  }

  if (!family) {
    console.error('❌ Could not find ANY family in the database. Please register via the portal first.');
    return;
  }

  console.log('✅ Family Profile Loaded:');
  console.log(`   - Name: ${family.name || family.family_name}`);
  console.log(`   - Children: ${family.children_count}`);
  console.log(`   - Housing: ${family.housing_type}`);
  console.log(`   - Urgent Needs: ${JSON.stringify(family.urgent_needs)}\n`);

  // 3. Initialize Automation (No Cookies) & AI Agent
  const bot = new InstagramAutomation(); // No cookies = guest mode
  const agent = new YouComAgent();

  try {
    await bot.init();
    
    // Login if credentials are provided in .env
    if (process.env.IG_USERNAME && process.env.IG_PASSWORD) {
      console.log(`🔐 Logging in as ${process.env.IG_USERNAME} to bypass restrictions...`);
      await bot.loginWithCredentials(process.env.IG_USERNAME, process.env.IG_PASSWORD);
      console.log('✅ Login successful. Starting scrape...\n');
    } else {
      console.log('🌐 Guest Mode (No credentials in .env). Warning: Instagram may block access.\n');
    }

    for (const account of TARGET_ACCOUNTS) {
      console.log(`\n--- Analyzing @${account} ---`);
      
      // Scrape latest post
      const postInfo = await bot.getLatestPostInfo(account);

      if (postInfo && postInfo.caption) {
        console.log(`📝 Latest Caption: "${postInfo.caption.substring(0, 100).replace(/\n/g, ' ')}..."`);
        console.log(`🔗 URL: ${postInfo.url}`);
        
        // Generate Comment
        console.log('🤖 Generating Comment...');
        const comment = await agent.generateComment(postInfo.caption, family);
        
        console.log('💬 Generated Comment:');
        console.log(`   "${comment}"`);
      } else {
        console.log('❌ Could not retrieve post or caption (Login wall or private account?)');
        console.log('🛑 Stopping loop to allow inspection of the browser...');
        break;
      }
      
      // Pause to be polite/avoid instant rate limit
      await new Promise(r => setTimeout(r, 5000));
    }

  } catch (e) {
    console.error('❌ Scrape failed:', e);
  } finally {
    // await bot.close();
    console.log('\n✅ Dry run finished. Browser staying open for inspection (Ctrl+C to exit)...');
    await new Promise(() => {}); // Keep process alive
  }
}

runDryRun();