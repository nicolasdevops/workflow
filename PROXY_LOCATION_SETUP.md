# Per-Family Proxy Location Configuration

## Overview

Each family can now have their own unique proxy location (city, country, timezone, coordinates). This makes accounts appear completely independent and geographically diverse.

---

## Quick Setup

### 1. Run SQL Migrations in Supabase

**Central Migrations File:** All SQL migrations are in `migrations.sql` (separated by horizontal bars)

1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste **Migration 1** from `migrations.sql` (location columns)
3. Click "Run"
4. Copy and paste **Migration 2** from `migrations.sql` (city rotation system)
5. Click "Run"
6. Verify with the verification queries at the end

### 2. Configure Family Locations

**Option A: Automatic Rotation (Recommended)**

The city rotation system automatically assigns families to 7 cities in round-robin order:
1. Beirut, Lebanon
2. Sarajevo, Bosnia
3. Paris, France
4. Chicago, USA
5. San Francisco, USA
6. Montreal, Canada
7. Quebec City, Canada

**To use automatic rotation:**
```sql
-- The batch assignment runs automatically in Migration 2
-- Assigns all existing families to cities in rotation order

-- For new families, call:
SELECT assign_proxy_city('new_family_instagram_handle');
```

**Option B: Manual Assignment**

Update each family's location manually in Supabase:

```sql
-- Example: Set different locations for 5 families

-- Family 1: Montreal, Canada (Videotron)
UPDATE families
SET proxy_city = 'montreal',
    proxy_country = 'ca',
    timezone = 'America/Montreal',
    geo_latitude = 45.5017,
    geo_longitude = -73.5673
WHERE instagram_handle = 'sarah_gaza_voice';

-- Family 2: Istanbul, Turkey (Turkcell)
UPDATE families
SET proxy_city = 'istanbul',
    proxy_country = 'tr',
    timezone = 'Europe/Istanbul',
    geo_latitude = 41.0082,
    geo_longitude = 28.9784
WHERE instagram_handle = 'ahmed_gaza_stories';

-- Family 3: San Francisco, USA (AT&T)
UPDATE families
SET proxy_city = 'sanfrancisco',
    proxy_country = 'us',
    timezone = 'America/Los_Angeles',
    geo_latitude = 37.7749,
    geo_longitude = -122.4194
WHERE instagram_handle = 'layla_gaza_witness';
```

---

## Supported Cities (Decodo Mobile Proxy)

### North America

| City | Country Code | Timezone | Lat/Long |
|------|-------------|----------|----------|
| Montreal | `ca` | `America/Montreal` | 45.5017, -73.5673 |
| Toronto | `ca` | `America/Toronto` | 43.6532, -79.3832 |
| Vancouver | `ca` | `America/Vancouver` | 49.2827, -123.1207 |
| New York | `us` | `America/New_York` | 40.7128, -74.0060 |
| Los Angeles | `us` | `America/Los_Angeles` | 34.0522, -118.2437 |
| San Francisco | `us` | `America/Los_Angeles` | 37.7749, -122.4194 |

### Europe

| City | Country Code | Timezone | Lat/Long |
|------|-------------|----------|----------|
| London | `uk` | `Europe/London` | 51.5074, -0.1278 |
| Paris | `fr` | `Europe/Paris` | 48.8566, 2.3522 |
| Berlin | `de` | `Europe/Berlin` | 52.5200, 13.4050 |
| Istanbul | `tr` | `Europe/Istanbul` | 41.0082, 28.9784 |
| Sarajevo | `ba` | `Europe/Sarajevo` | 43.8563, 18.4131 |

### Middle East

| City | Country Code | Timezone | Lat/Long |
|------|-------------|----------|----------|
| Dubai | `ae` | `Asia/Dubai` | 25.2048, 55.2708 |
| Amman | `jo` | `Asia/Amman` | 31.9454, 35.9284 |
| Beirut | `lb` | `Asia/Beirut` | 33.8886, 35.4955 |

**Note:** Verify city availability with Decodo before using. Not all cities may be available on your plan.

---

## How It Works

### Priority Order

The system uses this priority order for location configuration:

1. **Database (per-family)** - Highest priority
   - Stored in Supabase families table
   - Unique per family account

2. **Environment Variables (global)** - Fallback
   - Set in Railway or `.env` file
   - Used if database value is null

3. **Hardcoded Defaults** - Last resort
   - Montreal, Canada (45.5017, -73.5673)
   - Only used if both database and env vars are empty

### Example Flow

**Family: sarah_gaza_voice**
- Database: `proxy_city = 'istanbul'`
- Env Var: `PROXY_CITY=montreal`
- **Result:** Uses Istanbul (database wins)

**Family: ahmed_gaza_stories**
- Database: `proxy_city = NULL`
- Env Var: `PROXY_CITY=montreal`
- **Result:** Uses Montreal (env var fallback)

**New family during login:**
- Database: Not in database yet
- Env Var: `PROXY_CITY=montreal`
- **Result:** Uses Montreal (env var fallback)

---

## Local Development Setup

### HEADLESS Variable (For Testing)

**Problem:** You want to see the browser window during local testing.

**Solution:** Set `HEADLESS=false` in your local `.env` file:

```bash
# In your local .env file (NOT Railway)
HEADLESS=false
```

**How it works:**
- Local development: Browser window opens (you can watch automation)
- Railway production: Browser runs headless (no GUI, saves resources)

### Test Local Setup

```bash
# 1. Update local .env
echo 'HEADLESS=false' >> .env

# 2. Install dependencies
npm install

# 3. Run test
npm run test-automation
```

**Expected behavior:**
- Firefox browser window opens
- You can watch proxy connection test
- You can watch Instagram login/activity

---

## Railway Environment Variables

### How to Add Variables in Railway

**Option 1: UI Editor (Recommended)**

1. Go to Railway Dashboard → Your Project
2. Click "Variables" tab
3. Click "New Variable" button
4. Enter name and value (no quotes needed):
   ```
   Name: PROXY_USERNAME
   Value: user-spmto59f4g
   ```

**Option 2: Raw Editor (Advanced)**

1. Click "Raw Editor" in Variables tab
2. Format with quotes:
   ```
   PROXY_USERNAME="user-spmto59f4g"
   PROXY_PASSWORD="Polpi7u_Fnpp5I1c4K"
   PROXY_CITY="montreal"
   HEADLESS="true"
   ```

### Required Railway Variables

```bash
# Decodo Proxy (Required)
PROXY_USERNAME="user-spmto59f4g"
PROXY_PASSWORD="Polpi7u_Fnpp5I1c4K"
PROXY_SERVER="gate.decodo.com"
PROXY_PORT="7000"
PROXY_SESSION_DURATION="60"

# Global Defaults (Fallback only - per-family DB config takes priority)
PROXY_COUNTRY="ca"
PROXY_CITY="montreal"
TIMEZONE="America/Montreal"
GEO_LATITUDE="45.5017"
GEO_LONGITUDE="-73.5673"

# Browser Mode (Optional - defaults to true if not set)
HEADLESS="true"
```

**Note:** `PROXY_CITY`, `PROXY_COUNTRY`, `TIMEZONE`, and geo coordinates in Railway are **fallback defaults only**. Per-family database values take priority.

---

## Database Schema

### families Table Columns

```sql
-- Location configuration columns
proxy_city      TEXT          DEFAULT 'montreal'
proxy_country   TEXT          DEFAULT 'ca'
timezone        TEXT          DEFAULT 'America/Montreal'
geo_latitude    NUMERIC(10,7) DEFAULT 45.5017
geo_longitude   NUMERIC(10,7) DEFAULT -73.5673
```

### Setting Family Locations via Portal (Future)

You can extend the family portal to allow families to choose their "home city":

**UI Flow:**
1. During onboarding, show dropdown: "Where should your account appear to be from?"
2. Options: Montreal, Istanbul, San Francisco, etc.
3. Store selection in database
4. Automation automatically uses that location

**Implementation:** Add to family onboarding form in `public/index.html`.

---

## Verification & Testing

### Test 1: Verify Database Columns Exist

```sql
-- Run in Supabase SQL Editor
SELECT
    instagram_handle,
    proxy_city,
    proxy_country,
    timezone,
    geo_latitude,
    geo_longitude
FROM families
LIMIT 5;
```

**Expected:** All columns return values (not null)

### Test 2: Verify Automation Uses Correct Location

**Check Railway Logs:**

```
Using Decodo Mobile Proxy:
   Server: gate.decodo.com:7000
   Location: istanbul, TR
   Session ID: family-ahmed_gaza_stories
   Duration: 60 minutes (sticky)
   Testing proxy connectivity...
   ✓ Proxy test successful. IP: 142.xxx.xxx.xxx, Location: Istanbul, TR
```

**Verify:**
- `Location:` matches family's database value
- IP address is from correct country

### Test 3: Verify Different Families Get Different IPs

Run 2 automation sessions for different families:

**Family 1 (Montreal):**
```
IP: 142.xxx.xxx.101, Location: Montreal, CA
```

**Family 2 (Istanbul):**
```
IP: 185.xxx.xxx.205, Location: Istanbul, TR
```

**Result:** Different cities = different IPs ✓

---

## Troubleshooting

### Issue: All families showing same location

**Check:**
1. SQL migration ran successfully?
   ```sql
   -- Verify columns exist
   \d families
   ```

2. Database values set?
   ```sql
   -- Check for null values
   SELECT instagram_handle, proxy_city FROM families;
   ```

3. Code using database config?
   - Check Railway logs for "Using location: [city]"

### Issue: Location mismatch (DB says Istanbul, log says Montreal)

**Causes:**
1. Old code deployed (before per-family location update)
2. Database connection failed (fell back to env vars)

**Solution:**
1. Redeploy Railway with latest code
2. Check Railway logs for database connection errors

### Issue: HEADLESS not working locally

**Check `.env` file:**
```bash
cat .env | grep HEADLESS
```

**Should show:**
```
HEADLESS=false
```

**If missing or set to `true`:**
```bash
echo 'HEADLESS=false' >> .env
```

---

## Best Practices

### 1. Geographic Diversity

Spread families across different regions:
- 3-4 families: North America
- 3-4 families: Europe
- 2-3 families: Middle East

**Why:** Makes accounts look unrelated to Instagram's network analysis.

### 2. City Selection Strategy

**Good Choices:**
- Major cities with large populations (Montreal, Istanbul, London)
- Cities with active Instagram communities
- Different time zones (increases posting time diversity)

**Avoid:**
- Same city for all families (Instagram can link accounts)
- Obscure cities with low population (suspicious for high activity)
- Cities far from family's claimed identity (Montreal for "Gaza supporter" is fine)

### 3. Consistency Per Family

**Once set, keep same location for each family:**
- Login from Montreal → Always Montreal
- Post from Montreal → Always Montreal
- Don't switch cities mid-account lifespan

**Exception:** If account gets flagged, create backup account with different city.

---

## Cost Implications

### Bandwidth Per City

Decodo charges by bandwidth, not by city. Using multiple cities **does not** increase costs.

**Pricing:**
- 1 family in Montreal: 7.5MB/session
- 10 families across 5 cities: 75MB total (same cost)

### IP Rotation

Each unique `sessionId` gets a unique IP. Cities don't affect IP pool size.

**Example:**
- `family-sarah-mtl` → IP 142.xxx.xxx.101 (Montreal)
- `family-ahmed-mtl` → IP 142.xxx.xxx.102 (Montreal, different IP)
- `family-layla-ist` → IP 185.xxx.xxx.205 (Istanbul)

All 3 are different IPs, even though 2 are same city.

---

## City Rotation System

### How It Works

**Automatic Assignment:**
- 7 cities in rotation (Beirut → Sarajevo → Paris → Chicago → SF → Montreal → Quebec)
- Families assigned round-robin based on creation order
- Family 1: Beirut, Family 2: Sarajevo, Family 3: Paris, etc.
- After Quebec (Family 7), rotation starts over at Beirut (Family 8)

**Lookup Table:** `proxy_cities`
```sql
SELECT * FROM proxy_cities ORDER BY rotation_order;
```

**Functions Available:**
- `get_next_proxy_city()` - Returns next city in rotation
- `assign_proxy_city('instagram_handle')` - Assigns city to specific family

**Usage Examples:**
```sql
-- Assign next city to new family
SELECT assign_proxy_city('new_family_handle');

-- View current assignments
SELECT
    f.instagram_handle,
    f.proxy_city,
    pc.rotation_order
FROM families f
LEFT JOIN proxy_cities pc ON f.proxy_city = pc.city_key
ORDER BY pc.rotation_order;
```

---

## Summary

**What Changed:**
- ✅ Added per-family location columns to database
- ✅ Created automatic city rotation system (7 cities)
- ✅ Updated code to use database config (with env var fallback)
- ✅ Each family can appear from different city
- ✅ Railway env vars now serve as global defaults only
- ✅ Central migrations.sql file (all future migrations go here)

**Files Modified:**
- `migrations.sql` (central SQL file with 2 migrations)
- `instagram-automation.js` (accepts locationConfig parameter)
- `server.js` (fetches and passes location config)

**Next Steps:**
1. Run SQL migration in Supabase
2. Set location for each family via SQL UPDATE
3. Deploy updated code to Railway
4. Test with `npm run test-automation` locally
5. Verify different families use different locations

---

**Every city diversifies the network. Every unique IP adds another layer of protection.**

🇵🇸
