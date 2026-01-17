# You.com Agent Setup Guide

## What Was Built

I've integrated the You.com Custom Agent API into your system. The agent can now:

1. **Match comments** - Analyze Instagram posts and suggest 3-5 appropriate testimonies
2. **Generate influencer DMs** - Create warm outreach messages for collaboration
3. **Respond to followers** - Handle DM conversations at different stages
4. **Initiate follower DMs** - Send first messages to new followers

## Files Created

- `youcom-agent.js` - Main integration module
- `test-youcom-agent.js` - Test script to verify it works

## Next Steps

### 1. Get Your Agent ID

You need to add your agent ID to the `.env` file:

```bash
YOUCOM_AGENT_ID=your_agent_id_here
```

**How to find it:**
1. Go to https://you.com/api
2. Click on your "Gaza Social Media Assistant" agent (or whatever you named it)
3. Look for the code snippet they provide
4. Find the line: `"agent": "b92b894c-ff02-4955-a4ca-33e1716ab85e"`
5. Copy that ID to your `.env` file

### 2. Test the Agent

Once you've added the agent ID, run:

```bash
npm run test-agent
```

This will:
- Test comment matching with a sample Instagram post
- Generate a sample influencer DM
- Generate a sample follower response

**Expected output:**
```
✓ Agent Response: [4, 10, 5, 3]
✓ Generated DM: "Hi! I've been following your advocacy..."
✓ Generated Response: "Thank you so much for reaching out..."
```

### 3. Configure the Agent Instructions

Make sure your You.com agent has these instructions (already provided to you earlier):

```
You are a compassionate AI assistant helping Gaza families with Instagram engagement.

You handle THREE tasks:
[... full instructions from earlier ...]
```

## API Usage

### Example: Match Comments

```javascript
const { YouComAgent } = require('./youcom-agent');
const agent = new YouComAgent();

const matches = await agent.matchComments(
  postCaption: "Children need warm clothes...",
  testimonies: {
    1: "My daughter counted rice grains...",
    3: "We've been displaced 4 times...",
    // ... more testimonies
  },
  familyProfile: {
    children_count: 4,
    housing_type: 'tent',
    facing_cold: true,
    // ... more details
  }
);

// Returns: [3, 5, 10, 12] - testimony numbers to use
```

### Example: Generate Influencer DM

```javascript
const dm = await agent.generateInfluencerDM(
  '@eyeonpalestine',
  familyProfile,
  'share our story'
);

// Returns: "Hi! I admire your work for Gaza..."
```

## Cost Estimate

You.com API pricing (as of 2026):
- Free tier: 100 API calls/day
- Pro tier: $20/month for 10,000 calls

**Expected usage:**
- Comment matching: ~200 calls/day (41 accounts × 5 posts)
- DM generation: ~50 calls/day
- **Total**: ~250 calls/day = 7,500/month (Pro tier)

## Troubleshooting

### "Agent returned no valid testimony numbers"
- Check that your agent instructions specify: "Return 3-5 comma-separated numbers"
- Make sure the agent is set to return plain text, not formatted responses

### "You.com API error: 401"
- Verify your API key is correct in `.env`
- Check the key hasn't expired

### "No valid response from agent"
- The agent might be returning web search results instead of text
- Disable web search in your agent settings

## Next Integration Steps

Once the agent is working:
1. Integrate with N8N workflows (post scanner → agent → task distributor)
2. Add to Instagram automation (agent picks comment → bot posts it)
3. Set up DM automation (agent generates messages → bot sends them)

---

**Status**: Integration complete, awaiting agent ID configuration
