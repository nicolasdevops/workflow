# Gaza Protocol - Project Context for Claude

## What This Project Is

A humanitarian system to help families in Gaza raise funds through Instagram outreach. The system:

1. **Collects family data** via a Single Page Application (public/index.html)
2. **Creates synthetic Instagram accounts** on their behalf (to protect their real accounts from Meta's content moderation)
3. **Warms up new accounts** over 14 days with humanized behavior before adding fundraising links
4. **Posts supportive comments** on pro-Gaza accounts to drive traffic to family fundraising pages

## Tech Stack

- **Backend**: Node.js/Express (server.js)
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Railway
- **Browser Automation**: Playwright (Firefox)
- **Proxy**: Decodo Mobile SOCKS5H (fail-closed - refuses to run without proxy)
- **AI Comments**: You.com Agent API (youcom-agent.js)

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Main Express server with all API routes and schedulers |
| `instagram-automation.js` | Playwright-based Instagram bot with humanized behavior |
| `apify-scraper.js` | Apify-based profile scraper (replaces headless login for initial data) |
| `b2-storage.js` | Backblaze B2 storage for persistent Instagram media |
| `warmup-scheduler.js` | 14-day progressive warm-up for new accounts |
| `username-generator.js` | Creates Instagram usernames with peaceful/Middle Eastern themes |
| `youcom-agent.js` | Generates contextual comments via You.com AI |
| `encryption.js` | AES-256-GCM for cookie/password storage |
| `migrations.sql` | Supabase schema migrations (run manually in SQL Editor) |
| `public/index.html` | Family registration SPA |

## Apify Instagram Scraper

Instead of requiring families to login via headless browser (risky for account safety), we now use Apify to scrape their public profile data:

### Flow
1. Family enters their Instagram username (password optional)
2. System checks if account is public via Apify
3. If public: scrape profile data (bio, pic, followers, all posts)
4. Extract fundraiser links from bio automatically
5. 24-hour cooldown between scrapes

### Database Tables (Migration 6)
- `mothers_profiles`: Scraped profile data (bio, pic, fundraiser links)
- `mothers_content`: Scraped posts/reels
- `profile_scrape_status`: View showing scrape cooldown status

### API Endpoints
```bash
POST /api/portal/instagram/check-public  # Verify account is public
POST /api/portal/instagram/scrape        # Trigger profile scrape
GET /api/portal/instagram/profile        # Get scraped profile
GET /api/portal/instagram/content        # Get scraped posts
```

### Environment Variable
```bash
APIFY_API_TOKEN=xxx  # Required for scraping
```

## Backblaze B2 Storage (Optional)

B2 provides unlimited storage with no file size limits. Free egress via Cloudflare CDN.

### What Uses B2
1. **Instagram scraped media**: Profile pics, post images, videos from Apify scrapes
2. **Family uploads**: Photos/videos uploaded by families (removes Supabase 50MB/1GB limits)

### How It Works
- Scraped media: `families/{familyId}/profile.jpg`, `families/{familyId}/posts/{shortCode}.jpg`
- Family uploads: `families/{familyId}/uploads/{timestamp}.{ext}`
- URLs stored in database, served directly (no signing needed)

### Configuration
```bash
B2_KEY_ID=xxx           # Application Key ID
B2_APPLICATION_KEY=xxx  # Application Key
B2_BUCKET_NAME=xxx      # Your bucket name
B2_REGION=us-west-004   # Found in bucket endpoint URL (e.g., s3.us-west-004.backblazeb2.com)
```

If B2 is not configured, falls back to Supabase storage (with limits).

---

## Two Types of Instagram Accounts

1. **Original Account** (`instagram_handle` + `cookies`)
   - Family's real existing Instagram account
   - Connected via login flow in the portal
   - Used for comment posting automation

2. **Synthetic Account** (`ig_username` + `ig_email` + `ig_password`)
   - Created by admin on family's behalf
   - Western-sounding names matching proxy city (avoid "gaza" in username)
   - Goes through 14-day warm-up before activation

## Automation Control (4 Switches)

All switches default to `FALSE` for safety. Admin must explicitly enable:

| Switch | Controls | Scheduler |
|--------|----------|-----------|
| `bestbehavior_enabled` | Warm-up & rehab | Daily at 6 AM UTC |
| `commenting_enabled` | Comment posting | Hourly |
| `contentposting_enabled` | Content posting | TBA |
| `dm_enabled` | Direct messaging | TBA |

### Admin API Endpoints

```bash
# Toggle single switch
POST /api/admin/automation/:familyId
{ "switch": "commenting_enabled", "enabled": true }

# Bulk toggle
POST /api/admin/automation/:familyId/bulk
{ "bestbehavior_enabled": true, "commenting_enabled": false }

# View all status
GET /api/admin/automation/status
```

## Warm-Up Phases

- **Days 1-7 (Silent)**: Browse feed, like posts, follow neutral accounts (natgeo, food52, etc.)
- **Days 8-14 (Engagement)**: Follow humanitarian accounts, post generic supportive comments
- **Day 15+**: Account marked `active`, fundraising link added to bio, comment automation enabled

## Bandwidth Optimization

Mobile proxies are expensive (~$10/2GB). Data Saver mode reduces usage:
- Login + 15s scroll: ~7.5MB per session
- Headers: `X-IG-Bandwidth-Speed-KBPS: 500`, `Save-Data: on`
- Blocks: ads, tracking pixels, fonts (not essential resources)
- See `BANDWIDTH_OPTIMIZATION.md` for full details

## Proxy Configuration

Each family gets a rotating proxy city (8 cities):
- Doha, Miami, Toronto, Barcelona, Helsinki, Oslo, Copenhagen, Sarajevo

Stored per-family: `proxy_city`, `proxy_country`, `timezone`, `geo_latitude`, `geo_longitude`

## Current State (as of 2026-02-07)

### Completed
- Family registration SPA with photo/video upload
- Instagram login with 2FA support
- Cookie encryption and storage
- Per-family proxy location rotation (8 cities)
- Username generator with Palestinian themes
- 14-day warm-up scheduler
- Hourly comment posting scheduler
- 4 granular automation switches
- Bandwidth optimization with Data Saver mode
- Apify profile scraper (replaces headless login for initial data)
- Fundraiser link extraction from bio
- Backblaze B2 storage for persistent media URLs (optional)

### Pending
- Run Migration 6 in Supabase (adds Apify scraper tables)
- Content posting scheduler (`contentposting_enabled`)
- DM automation (`dm_enabled`)
- Admin dashboard UI for switch management

## Environment Variables (Railway)

```bash
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
ENCRYPTION_KEY=32-byte-hex-string

# Proxy (Decodo)
DECODO_PROXY_USER=xxx
DECODO_PROXY_PASS=xxx

# AI Comments
YOUCOM_API_KEY=xxx
YOUCOM_AGENT_ID=xxx

# Apify (for profile scraping)
APIFY_API_TOKEN=xxx

# Backblaze B2 (optional, for persistent media storage)
B2_KEY_ID=xxx
B2_APPLICATION_KEY=xxx
B2_BUCKET_NAME=xxx
B2_REGION=us-west-004

# Optional
SCROLL_DURATION_MS=15000
HEADLESS=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=xxx
```

## Username Generator Philosophy

Usernames should feel like they come from a Gazan mother/child, NOT Western or academic:
- Good: `@littlebird62`, `@walkingwithfather33`, `@holdmyheart408`, `@smileformother91`
- Bad: `@jasmine_dreams`, `@patient_hope`, `@ahmed_gaza_voice`

Word banks: olives, palm trees, tears, hands, hearts, walking, praying, mother, father, etc.

## Common Commands

```bash
# Local development
npm run dev

# Check Railway logs
railway logs

# Run migration (in Supabase SQL Editor)
# Copy content from migrations.sql

# Test proxy connection
curl -x socks5h://user:pass@gate.decodo.com:7777 https://api.ipify.org
```

## Architecture Notes

- **Fail-closed proxy**: `instagram-automation.js` refuses to launch browser without valid proxy
- **Gaussian delays**: All waits use bell-curve randomness, not fixed values
- **Sequential processing**: Families processed one at a time to avoid parallel proxy sessions
- **5-15 min gaps**: Random delays between families during batch runs
