# Changelog

## 2026-02-06 - Apify Instagram Scraper Integration

**Commit:** (pending)

### Changes
- **New Apify scraper module** (`apify-scraper.js`):
  - Check if account is public before scraping
  - 24-hour cooldown between scrapes
  - Scrape profile data: bio, name, profile pic, followers
  - Extract fundraiser links from bio (GoFundMe, PayPal, etc.)
  - Scrape all posts/content

- **Database schema** (Migration 6):
  - `mothers_profiles` table - scraped profile data
  - `mothers_content` table - scraped posts/reels
  - `ig_profile_scraped` flag on families table
  - `profile_scrape_status` view

- **Server endpoints**:
  - `POST /api/portal/instagram/check-public` - verify account is public
  - `POST /api/portal/instagram/scrape` - trigger profile scrape
  - `GET /api/portal/instagram/profile` - get scraped profile
  - `GET /api/portal/instagram/content` - get scraped content

- **Client SPA changes**:
  - New scrape-based Instagram flow (replaces headless browser login)
  - Password now optional (greyer input field, +2px label spacing)
  - Scraped profile display with fundraiser links
  - Content preview grid
  - 24-hour cooldown indicator

### Files Added
- `apify-scraper.js`

### Files Modified
- `migrations.sql` (Migration 6 added)
- `server.js` (Apify endpoints)
- `public/index.html` (Instagram panel UI)

---

## 2026-02-06 - Automation Switches & City Rotation Update

**Commit:** ba3bc90

### Changes
- **4 automation switches** replacing single `automation_enabled`:
  - `bestbehavior_enabled` - warm-up/rehab scheduler
  - `commenting_enabled` - hourly comment posting
  - `contentposting_enabled` - TBA
  - `dm_enabled` - TBA

- **New city rotation list** (8 cities):
  - Doha, Miami, Toronto, Barcelona, Helsinki, Oslo, Copenhagen, Sarajevo

- **Migration fixes**:
  - Added `assign_proxy_city_by_id()` function (works without instagram_handle)
  - Fixed column name `family_name` → `name`
  - Fixed query ordering to avoid referencing columns before they exist

- **New files**:
  - `CLAUDE.md` - Project context for Claude sessions
  - `CHANGELOG.md` - This file

### Files Modified
- `migrations.sql`
- `server.js`
- `warmup-scheduler.js`
