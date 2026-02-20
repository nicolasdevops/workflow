/**
 * Test script for You.com agent integration
 */

require('dotenv').config();
const { YouComAgent } = require('./youcom-agent');

async function testAgent() {
  console.log('=== You.com Agent Test ===\n');

  // Check env vars
  if (!process.env.YOUCOM_API_KEY || process.env.YOUCOM_API_KEY === 'your_youcom_api_key') {
    console.error('❌ YOUCOM_API_KEY not set in .env file');
    return;
  }

  if (!process.env.YOUCOM_AGENT_ID || process.env.YOUCOM_AGENT_ID === 'your_agent_id_here') {
    console.error('❌ YOUCOM_AGENT_ID not set in .env file');
    console.log('\nTo get your agent ID:');
    console.log('1. Go to https://you.com/api');
    console.log('2. Find your custom agent');
    console.log('3. Copy the agent ID from the code snippet\n');
    return;
  }

  const agent = new YouComAgent();

  console.log('✓ API Key and Agent ID loaded\n');

  // Test 1: Comment Matching
  console.log('TEST 1: Comment Matching');
  console.log('─────────────────────────\n');

  const testPost = "Children in Gaza are sleeping without blankets in freezing temperatures. Winter is brutal.";
  const testTestimonies = {
    1: "My daughter counted the rice grains in our last meal...",
    3: "We've been displaced 4 times, now living in a tent with no heating",
    4: "The cold seeps through our tent at night, my children shiver",
    5: "Winter came and we have no warm clothes for the children",
    10: "Displaced and desperate, we sleep on wet ground",
    12: "My baby's hands turn blue from the cold every night"
  };

  const testFamily = {
    children_count: 4,
    children_ages: [2, 5, 8, 10],
    housing_type: 'tent',
    medical_conditions: [],
    facing_cold: true,
    facing_hunger: true,
    displacement_count: 3
  };

  try {
    console.log('Post caption:', testPost);
    console.log('\nCalling agent...');

    const matches = await agent.matchComments(testPost, testTestimonies, testFamily);

    console.log('\n✓ Agent Response:', matches);
    console.log('Selected testimonies:');
    matches.forEach(num => {
      if (testTestimonies[num]) {
        console.log(`  ${num}. ${testTestimonies[num].substring(0, 60)}...`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n');

  // Test 2: Influencer DM
  console.log('TEST 2: Influencer DM Generation');
  console.log('─────────────────────────────────\n');

  try {
    console.log('Generating DM for @eyeonpalestine...');

    const dm = await agent.generateInfluencerDM('@eyeonpalestine', testFamily, 'share our story');

    console.log('\n✓ Generated DM:');
    console.log('━'.repeat(50));
    console.log(dm);
    console.log('━'.repeat(50));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n');

  // Test 3: Follower Response
  console.log('TEST 3: Follower Response');
  console.log('─────────────────────────\n');

  try {
    const followerMsg = "I want to help, what do you need most?";
    console.log('Follower said:', followerMsg);
    console.log('\nGenerating response...');

    const response = await agent.generateFollowerResponse(
      followerMsg,
      testFamily,
      'first_contact',
      'https://gofundme.com/example'
    );

    console.log('\n✓ Generated Response:');
    console.log('━'.repeat(50));
    console.log(response);
    console.log('━'.repeat(50));

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n=== Tests Complete ===\n');
}

testAgent().catch(console.error);
