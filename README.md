# Gaza Protocol - Instagram Automation System

Humanitarian emergency response system helping 15+ Gaza families coordinate automated social media outreach.

## What's Been Built (Phase 1)

### ✅ Core Infrastructure
- **Dockerfile**: Fixed for Railway deployment with Playwright support
- **Instagram Automation Engine**: Human-like behavior simulation using Firefox/Playwright
- **Database Schema**: Supabase PostgreSQL tables for families, posts, and assignments
- **Environment Configuration**: Secure env variable management

### ✅ Human Behavior Simulation

The automation includes realistic human patterns:

```javascript
✓ Gaussian timing (not uniform random)
✓ Human typing with typos and corrections
✓ Natural scrolling and reading pauses
✓ Liking posts/comments (15-25 posts, 10-15 comments)
✓ 30-minute concentrated activity bursts
✓ Generic "Free Palestine" comments mixed in
✓ Timezone-aware (Gaza time, 8 AM - 6 PM operation)
```

### ✅ Safety Features

- **Operation Window**: Only runs 8 AM - 6 PM Gaza time (families asleep)
- **Error Detection**: Stops if Instagram shows warnings
- **Account Protection**: Dual accounts per family, but only backup if primary suspended
- **Geolocation Spoofing**: Gaza coordinates + Israel VPN for authenticity

## File Structure

```
.
├── Dockerfile                  # Railway deployment (with Playwright)
├── docker-compose.yml          # Local development setup
├── package.json                # Node dependencies
├── .env.example                # Environment variable template
├── instagram-automation.js     # Core automation engine
├── test-instagram.js           # Test script for validation
├── for_supabase.sql           # Database schema
├── family_workflow.json        # N8N workflow template
├── worker.js                   # Cloudflare worker (API endpoints)
├── dashboard.html              # Monitoring dashboard
├── RAILWAY_DEPLOY.md          # Deployment instructions
└── README.md                   # This file
```

## Quick Start

### 1. Local Testing

```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your values

# Test the automation
node test-instagram.js
```

### 2. Deploy to Railway

See [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md) for full instructions.

```bash
# Push to GitHub
git init
git add .
git commit -m "Initial commit"
git push origin main

# Deploy via Railway dashboard
# (Connect GitHub repo, Railway auto-detects Dockerfile)
```

## How It Works

### Daily Operation Flow

```
8:00 AM (Gaza time)
  ├─ System wakes up
  ├─ Checks for new posts on 41 target accounts
  └─ Assigns comments to families (matched by AI)

9:00 AM - 6:00 PM
  ├─ Each family account gets one 30-min session
  ├─ Browse feed naturally (2-3 minutes)
  ├─ Like 15-25 posts rapidly
  ├─ Like 10-15 random comments
  ├─ Post 8-10 assigned comments with delays
  ├─ Drop 2-3 generic "Free Palestine" comments
  └─ Close session

6:00 PM
  └─ System sleeps (families active 7 PM - 2 AM)
```

### Account Safety Protocol

```
IF account shows ANY warning signs:
  ├─ STOP all automation immediately
  ├─ Alert admin via logs
  ├─ Wait for manual review
  └─ NEVER risk both accounts simultaneously

Backup account ONLY used if:
  ├─ Primary account already suspended
  └─ Manual approval given
```

## Next Steps (To Be Built)

### Phase 2: Core Features
- [ ] Dual-account rotation logic with safety checks
- [ ] One-click cookie extraction tool for families
- [ ] Timezone-aware job scheduling
- [ ] Real-time monitoring dashboard

### Phase 3: Advanced Features
- [ ] AI-powered comment matching (Claude via You.com API)
- [ ] Automatic post discovery from 41 target accounts
- [ ] Family-specific comment variations
- [ ] Engagement tracking and analytics

### Phase 4: Scale & Optimize
- [ ] Master N8N workflows (post scanner, task distributor)
- [ ] Family onboarding system
- [ ] Alert system (Telegram notifications)
- [ ] Performance optimization

## Testing Checklist

Before going live with real families:

- [ ] Test with dummy Instagram account
- [ ] Verify operation window timing (8 AM - 6 PM Gaza)
- [ ] Confirm human behavior looks natural
- [ ] Test error handling (bad cookies, rate limits)
- [ ] Run for 1 week with 1-2 test accounts
- [ ] Monitor for any Instagram warnings

## Security Notes

⚠️ **NEVER commit**:
- Real Instagram cookies/session tokens
- Family credentials
- Supabase service keys
- API keys

All sensitive data goes in `.env` file (gitignored).

## Support

This is a humanitarian project supporting families in Gaza. The goal is sustainable, ethical automation that helps families survive while minimizing platform detection.

Built with empathy for "stupid angels" - loving, tech-illiterate families who need help navigating modern social media to feed their children.

---

**Status**: Phase 1 Complete ✅
**Next**: Deploy to Railway and test with one family
