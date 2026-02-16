-- Add per-family proxy location columns to families table
-- Run this in Supabase SQL Editor

-- Add proxy location columns
ALTER TABLE families
ADD COLUMN IF NOT EXISTS proxy_city TEXT DEFAULT 'montreal',
ADD COLUMN IF NOT EXISTS proxy_country TEXT DEFAULT 'ca',
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Montreal',
ADD COLUMN IF NOT EXISTS geo_latitude NUMERIC(10, 7) DEFAULT 45.5017,
ADD COLUMN IF NOT EXISTS geo_longitude NUMERIC(10, 7) DEFAULT -73.5673;

-- Add comment for documentation
COMMENT ON COLUMN families.proxy_city IS 'City for Decodo proxy (lowercase, e.g., montreal, istanbul, sarajevo)';
COMMENT ON COLUMN families.proxy_country IS 'Country code for proxy (lowercase, e.g., ca, tr, ba)';
COMMENT ON COLUMN families.timezone IS 'IANA timezone matching proxy city (e.g., America/Montreal, Europe/Istanbul)';
COMMENT ON COLUMN families.geo_latitude IS 'Latitude coordinate matching proxy city';
COMMENT ON COLUMN families.geo_longitude IS 'Longitude coordinate matching proxy city';

-- Example: Update specific families to different locations
-- Uncomment and modify as needed:

-- Family 1: Montreal, Canada (Videotron)
-- UPDATE families
-- SET proxy_city = 'montreal',
--     proxy_country = 'ca',
--     timezone = 'America/Montreal',
--     geo_latitude = 45.5017,
--     geo_longitude = -73.5673
-- WHERE instagram_handle = 'sarah_gaza_voice';

-- Family 2: Istanbul, Turkey (Turkcell)
-- UPDATE families
-- SET proxy_city = 'istanbul',
--     proxy_country = 'tr',
--     timezone = 'Europe/Istanbul',
--     geo_latitude = 41.0082,
--     geo_longitude = 28.9784
-- WHERE instagram_handle = 'ahmed_gaza_stories';

-- Family 3: San Francisco, USA (AT&T)
-- UPDATE families
-- SET proxy_city = 'sanfrancisco',
--     proxy_country = 'us',
--     timezone = 'America/Los_Angeles',
--     geo_latitude = 37.7749,
--     geo_longitude = -122.4194
-- WHERE instagram_handle = 'layla_gaza_witness';

-- Family 4: Sarajevo, Bosnia (BH Telecom)
-- UPDATE families
-- SET proxy_city = 'sarajevo',
--     proxy_country = 'ba',
--     timezone = 'Europe/Sarajevo',
--     geo_latitude = 43.8563,
--     geo_longitude = 18.4131
-- WHERE instagram_handle = 'omar_gaza_resilience';

-- Family 5: Toronto, Canada (Rogers)
-- UPDATE families
-- SET proxy_city = 'toronto',
--     proxy_country = 'ca',
--     timezone = 'America/Toronto',
--     geo_latitude = 43.6532,
--     geo_longitude = -79.3832
-- WHERE instagram_handle = 'fatima_gaza_hope';

-- Verify the changes
SELECT
    instagram_handle,
    proxy_city,
    proxy_country,
    timezone,
    geo_latitude,
    geo_longitude
FROM families
WHERE instagram_handle IS NOT NULL
ORDER BY instagram_handle;

-- ============================================================================
-- MIGRATION 2: City Rotation System
-- Purpose: Auto-assign families to 7 rotating proxy cities
-- Date: 2026-01-27
-- ============================================================================

-- Create proxy_cities lookup table for rotation
CREATE TABLE IF NOT EXISTS proxy_cities (
    id SERIAL PRIMARY KEY,
    city_name TEXT UNIQUE NOT NULL,
    city_key TEXT UNIQUE NOT NULL, -- Lowercase key for Decodo (e.g., 'doha')
    country_code TEXT NOT NULL,    -- ISO 2-letter code (e.g., 'qa')
    timezone TEXT NOT NULL,         -- IANA timezone (e.g., 'Asia/Qatar')
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    network_provider TEXT,          -- Optional: ISP name for reference
    rotation_order INTEGER UNIQUE NOT NULL -- Order in rotation (1-8)
);

-- Clear old cities and insert new rotation list (8 cities)
-- Note: This list may be updated in the future
TRUNCATE proxy_cities RESTART IDENTITY CASCADE;

INSERT INTO proxy_cities (city_name, city_key, country_code, timezone, latitude, longitude, network_provider, rotation_order)
VALUES
    ('Doha', 'doha', 'qa', 'Asia/Qatar', 25.2854, 51.5310, 'Ooredoo/Vodafone', 1),
    ('Miami', 'miami', 'us', 'America/New_York', 25.7617, -80.1918, 'AT&T/T-Mobile', 2),
    ('Toronto', 'toronto', 'ca', 'America/Toronto', 43.6532, -79.3832, 'Rogers/Bell', 3),
    ('Barcelona', 'barcelona', 'es', 'Europe/Madrid', 41.3851, 2.1734, 'Movistar/Orange', 4),
    ('Helsinki', 'helsinki', 'fi', 'Europe/Helsinki', 60.1699, 24.9384, 'Elisa/DNA', 5),
    ('Oslo', 'oslo', 'no', 'Europe/Oslo', 59.9139, 10.7522, 'Telenor/Telia', 6),
    ('Copenhagen', 'copenhagen', 'dk', 'Europe/Copenhagen', 55.6761, 12.5683, 'TDC/Telia', 7),
    ('Sarajevo', 'sarajevo', 'ba', 'Europe/Sarajevo', 43.8563, 18.4131, 'BH Telecom', 8)
ON CONFLICT (city_key) DO UPDATE SET
    rotation_order = EXCLUDED.rotation_order,
    timezone = EXCLUDED.timezone,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

-- Function: Get next city in rotation
-- Returns city data for the next family in round-robin order
CREATE OR REPLACE FUNCTION get_next_proxy_city()
RETURNS TABLE (
    city_key TEXT,
    country_code TEXT,
    timezone TEXT,
    latitude NUMERIC,
    longitude NUMERIC
) AS $$
DECLARE
    total_families INTEGER;
    next_rotation_index INTEGER;
BEGIN
    -- Count total families with proxy assignments
    SELECT COUNT(*) INTO total_families
    FROM families
    WHERE proxy_city IS NOT NULL;

    -- Calculate next rotation index (modulo 8 for 8 cities)
    next_rotation_index = (total_families % 8) + 1;

    -- Return city data for this rotation position
    RETURN QUERY
    SELECT
        pc.city_key,
        pc.country_code,
        pc.timezone,
        pc.latitude,
        pc.longitude
    FROM proxy_cities pc
    WHERE pc.rotation_order = next_rotation_index;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-assign city to a specific family by ID
-- Usage: SELECT assign_proxy_city_by_id(1);
CREATE OR REPLACE FUNCTION assign_proxy_city_by_id(family_id_param INTEGER)
RETURNS TEXT AS $$
DECLARE
    city_data RECORD;
    assigned_city TEXT;
    family_name_val TEXT;
BEGIN
    -- Get next city in rotation
    SELECT * INTO city_data FROM get_next_proxy_city();

    -- Update family with city data
    UPDATE families
    SET
        proxy_city = city_data.city_key,
        proxy_country = city_data.country_code,
        timezone = city_data.timezone,
        geo_latitude = city_data.latitude,
        geo_longitude = city_data.longitude
    WHERE id = family_id_param
    RETURNING name INTO family_name_val;

    assigned_city := city_data.city_key;

    RETURN 'Assigned family ' || COALESCE(family_name_val, family_id_param::TEXT) || ' to ' || assigned_city;
END;
$$ LANGUAGE plpgsql;

-- Legacy function: Auto-assign city by instagram_handle (for backwards compatibility)
-- Usage: SELECT assign_proxy_city('sarah_gaza_voice');
CREATE OR REPLACE FUNCTION assign_proxy_city(family_handle TEXT)
RETURNS TEXT AS $$
DECLARE
    city_data RECORD;
    assigned_city TEXT;
BEGIN
    -- Get next city in rotation
    SELECT * INTO city_data FROM get_next_proxy_city();

    -- Update family with city data
    UPDATE families
    SET
        proxy_city = city_data.city_key,
        proxy_country = city_data.country_code,
        timezone = city_data.timezone,
        geo_latitude = city_data.latitude,
        geo_longitude = city_data.longitude
    WHERE instagram_handle = family_handle;

    assigned_city := city_data.city_key;

    RETURN 'Assigned ' || family_handle || ' to ' || assigned_city;
END;
$$ LANGUAGE plpgsql;

-- Batch assign cities to all families without proxy config
-- Run this ONCE to assign cities to existing families
DO $$
DECLARE
    family_record RECORD;
BEGIN
    FOR family_record IN
        SELECT id
        FROM families
        WHERE (proxy_city IS NULL OR proxy_city = 'montreal') -- Update null or default only
        ORDER BY id
    LOOP
        PERFORM assign_proxy_city_by_id(family_record.id);
    END LOOP;
END $$;

-- Verify rotation assignments (uses only columns available at this point)
SELECT
    f.id,
    f.name,
    f.instagram_handle AS account,
    f.proxy_city,
    f.proxy_country,
    f.timezone,
    pc.rotation_order,
    pc.network_provider
FROM families f
LEFT JOIN proxy_cities pc ON f.proxy_city = pc.city_key
ORDER BY pc.rotation_order, f.id;

-- Manual assignment examples (if needed)
-- SELECT assign_proxy_city_by_id(1);              -- Preferred: Assign by family ID
-- SELECT assign_proxy_city_by_id(2);              -- Works for all families
-- SELECT assign_proxy_city('sarah_gaza_voice');   -- Legacy: By instagram_handle (if set)

-- To override and manually set a specific city:
-- UPDATE families
-- SET proxy_city = 'beirut',
--     proxy_country = 'lb',
--     timezone = 'Asia/Beirut',
--     geo_latitude = 33.8886,
--     geo_longitude = 35.4955
-- WHERE instagram_handle = 'specific_family_handle';

-- ============================================================================
-- MIGRATION 3: Instagram Account Creation Columns
-- Purpose: Store Instagram credentials for accounts created on behalf of families
-- Date: 2026-01-28
-- ============================================================================

-- Add Instagram account creation columns
ALTER TABLE families
ADD COLUMN IF NOT EXISTS ig_email TEXT,
ADD COLUMN IF NOT EXISTS ig_email_password TEXT,
ADD COLUMN IF NOT EXISTS ig_username TEXT,
ADD COLUMN IF NOT EXISTS ig_password TEXT,
ADD COLUMN IF NOT EXISTS ig_phone_number TEXT,
ADD COLUMN IF NOT EXISTS ig_account_created_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS ig_account_status TEXT DEFAULT 'pending';

-- Add comments for documentation
COMMENT ON COLUMN families.ig_email IS 'Email address created for Instagram account (e.g., from ProtonMail/Tutanota)';
COMMENT ON COLUMN families.ig_email_password IS 'Password for the email account (encrypted in app)';
COMMENT ON COLUMN families.ig_username IS 'Instagram username (created on their behalf)';
COMMENT ON COLUMN families.ig_password IS 'Instagram account password (encrypted in app)';
COMMENT ON COLUMN families.ig_phone_number IS 'Phone number used for verification (from SMS service)';
COMMENT ON COLUMN families.ig_account_created_at IS 'Timestamp when Instagram account was created';
COMMENT ON COLUMN families.ig_account_status IS 'Status: pending, created, verified, suspended, or active';

-- Create index for account status queries
CREATE INDEX IF NOT EXISTS idx_families_ig_status ON families(ig_account_status);

-- View accounts pending creation
SELECT
    id,
    name,
    ig_email,
    ig_username,
    ig_account_status,
    proxy_city
FROM families
WHERE ig_account_status = 'pending'
ORDER BY id;

-- View all created accounts
SELECT
    id,
    name,
    ig_email,
    ig_username,
    ig_account_created_at,
    ig_account_status,
    proxy_city
FROM families
WHERE ig_account_status IN ('created', 'verified', 'active')
ORDER BY ig_account_created_at DESC;

-- Full verification with all account types (now that ig_username exists)
SELECT
    f.id,
    f.name,
    f.instagram_handle AS original_account,
    f.ig_username AS synthetic_account,
    f.proxy_city,
    f.proxy_country,
    pc.rotation_order
FROM families f
LEFT JOIN proxy_cities pc ON f.proxy_city = pc.city_key
ORDER BY f.id;

-- Example: Mark account as created
-- UPDATE families
-- SET ig_account_status = 'created',
--     ig_account_created_at = NOW()
-- WHERE id = 1;

-- Example: Update account credentials (do this via app with encryption)
-- IMPORTANT: Use Western names matching proxy location, NOT "gaza" keywords
-- UPDATE families
-- SET ig_email = 'antoine.boucher.92@protonmail.com',
--     ig_username = 'antoine_bouchard92',
--     ig_account_status = 'verified'
-- WHERE id = 1;

-- ============================================================================
-- NAMING STRATEGY: Western Names by Proxy City
-- Purpose: Avoid "gaza" keywords that trigger Instagram content moderation
-- ============================================================================

-- Montreal/Quebec families (French-Canadian names):
-- Email: antoine.boucher.92@protonmail.com, sylvie.perrault.88@protonmail.com
-- IG: @antoine_bouchard92, @sylviep_mtl, @claudeb_qc

-- Paris families (French names):
-- Email: didier.lefren.84@protonmail.com, gilles.peltier.90@protonmail.com
-- IG: @didier_lefren, @gillesparis, @didierlefrenelle

-- Chicago/SF families (American names):
-- Email: amy.rich.88@protonmail.com, marcus.powell.91@protonmail.com
-- IG: @amy_rich88, @marcuspowell, @johnnymartinez

-- Beirut families (Lebanese diaspora in West):
-- Email: marco.haddad.91@protonmail.com, levy.khoury.89@protonmail.com
-- IG: @marcohaddad91, @levykhoury, @marco_haddad

-- Sarajevo families (Bosnian diaspora names):
-- Email: mirza.kovac.90@protonmail.com, lejla.begic.93@protonmail.com
-- IG: @mirzakovac, @lejlabegic93, @mirza_k90

-- Birth year suffixes (88-95) make accounts look authentic without "gaza" keyword

-- ============================================================================
-- DETAILED NAMING GUIDE BY PROXY CITY
-- ============================================================================

-- MONTREAL/QUEBEC CITY (French-Canadian Names)
-- Male: Antoine, Claude, Sylvain, Marc, Pierre, Jean, Luc, André, Michel
-- Female: Sylvie, Marie, Sophie, Chantal, Nathalie, Julie, Isabelle, Véronique
-- Surnames: Boucher, Perrault, Bouchard, Gagnon, Roy, Côté, Gauthier, Morin
-- Examples:
--   - antoine.boucher.92@protonmail.com → @antoine_bouchard92
--   - sylvie.perrault.88@protonmail.com → @sylviep_mtl
--   - marc.gagnon.91@protonmail.com → @marcgagnon91

-- PARIS (French Names)
-- Male: Didier, Gilles, Thierry, Laurent, Olivier, Philippe, François, Éric
-- Female: Françoise, Brigitte, Catherine, Martine, Dominique, Monique
-- Surnames: Lefren, Peltier, Martin, Bernard, Dubois, Thomas, Robert, Richard
-- Examples:
--   - didier.lefren.84@protonmail.com → @didier_lefren
--   - gilles.peltier.90@protonmail.com → @gillesparis
--   - brigitte.martin.89@protonmail.com → @brigittem_paris

-- CHICAGO/SAN FRANCISCO (American Names)
-- Male: Marcus, Johnny, David, Michael, James, Robert, William, Christopher
-- Female: Amy, Amber, Jessica, Sarah, Jennifer, Emily, Ashley, Michelle
-- Surnames: Richardson, Powell, Martinez, Johnson, Williams, Brown, Davis, Garcia
-- Examples:
--   - amy.rich.88@protonmail.com → @amy_rich88
--   - marcus.powell.91@protonmail.com → @marcuspowell
--   - johnny.martinez.93@protonmail.com → @johnnymartinez

-- BEIRUT (Lebanese Diaspora - Western-friendly)
-- Male: Marco, Levy, Tony, George, Joseph, Daniel, Michael, Anthony
-- Female: Maya, Nadia, Layla, Rita, Tania, Mia, Sophia
-- Surnames: Haddad, Khoury, Nassif, Frem, Gemayel, Rizk, Sarkis
-- Examples:
--   - marco.haddad.91@protonmail.com → @marcohaddad91
--   - levy.khoury.89@protonmail.com → @levykhoury
--   - maya.nassif.92@protonmail.com → @mayanassif

-- SARAJEVO (Bosnian Diaspora Names)
-- Male: Mirza, Emir, Aldin, Kemal, Tarik, Amer, Jasmin
-- Female: Lejla, Amina, Emina, Selma, Samira, Lejla, Merima
-- Surnames: Kovac, Begic, Hadzic, Omerovic, Muratovic, Halilovic
-- Examples:
--   - mirza.kovac.90@protonmail.com → @mirzakovac
--   - lejla.begic.93@protonmail.com → @lejlabegic93
--   - emir.hadzic.88@protonmail.com → @emirhadzic

-- STRATEGY NOTES:
-- 1. Birth years 1988-1995 (ages 31-38) appear authentic and active on Instagram
-- 2. NEVER use "gaza", "palestine", "refugee" or politically charged keywords in usernames
-- 3. Match name ethnicity to proxy city for consistency (French names in Paris, etc.)
-- 4. Family can reveal Gaza story in BIO AFTER warm-up period (day 8+)
-- 5. Fundraising links added on day 15+ only
-- 6. Username/email mismatch is OK (antoine.boucher → @antoine_bouchard92)
-- 7. Slight spelling variations reduce pattern detection (Boucher → Bouchard)

-- ============================================================================
-- MIGRATION 4: Warm-Up Tracking Fields
-- Purpose: Track 14-day warm-up progress for new Instagram accounts
-- Date: 2026-02-01
-- ============================================================================

-- Add warm-up tracking columns
ALTER TABLE families
ADD COLUMN IF NOT EXISTS last_warmup_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS warmup_day INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN families.last_warmup_at IS 'Timestamp of last warm-up session run';
COMMENT ON COLUMN families.warmup_day IS 'Current warm-up day (1-14), 0 = not started, 15+ = complete';

-- Index for efficient warm-up queries
CREATE INDEX IF NOT EXISTS idx_families_warmup ON families(ig_account_status, ig_account_created_at)
WHERE ig_account_status IN ('created', 'warming_up');

-- View: Warm-up status for all accounts
-- Shows current phase and days remaining
CREATE OR REPLACE VIEW warmup_status AS
SELECT
    id,
    name,
    ig_username,
    ig_account_status,
    ig_account_created_at,
    last_warmup_at,
    warmup_day,
    CASE
        WHEN ig_account_created_at IS NULL THEN 0
        ELSE EXTRACT(DAY FROM (NOW() - ig_account_created_at)) + 1
    END AS calculated_day,
    CASE
        WHEN ig_account_created_at IS NULL THEN 'pending'
        WHEN EXTRACT(DAY FROM (NOW() - ig_account_created_at)) < 7 THEN 'phase1_silent'
        WHEN EXTRACT(DAY FROM (NOW() - ig_account_created_at)) < 14 THEN 'phase2_engagement'
        ELSE 'active'
    END AS current_phase,
    CASE
        WHEN ig_account_created_at IS NULL THEN 14
        ELSE GREATEST(0, 14 - EXTRACT(DAY FROM (NOW() - ig_account_created_at)))
    END AS days_remaining
FROM families
WHERE ig_username IS NOT NULL
ORDER BY ig_account_created_at DESC NULLS LAST;

-- Usage: SELECT * FROM warmup_status;

-- ============================================================================
-- MIGRATION 5: Granular Automation Control Switches
-- Purpose: Admin-controlled flags for different automation types
-- Date: 2026-02-06
-- ============================================================================

-- Add 4 granular automation control fields (all default OFF for safety)
ALTER TABLE families
ADD COLUMN IF NOT EXISTS bestbehavior_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS commenting_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS contentposting_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dm_enabled BOOLEAN DEFAULT FALSE;

-- Remove old single switch if it exists (optional - keep for backwards compat)
-- ALTER TABLE families DROP COLUMN IF EXISTS automation_enabled;

-- Add comments for documentation
COMMENT ON COLUMN families.bestbehavior_enabled IS 'Controls warm-up and account rehabilitation scheduler. FALSE by default.';
COMMENT ON COLUMN families.commenting_enabled IS 'Controls hourly comment posting on pro-Gaza accounts. FALSE by default.';
COMMENT ON COLUMN families.contentposting_enabled IS 'Controls content posting scheduler (TBA). FALSE by default.';
COMMENT ON COLUMN families.dm_enabled IS 'Controls direct messaging automation (TBA). FALSE by default.';

-- View: Automation status overview
CREATE OR REPLACE VIEW automation_overview AS
SELECT
    id,
    name,
    instagram_handle AS original_account,
    ig_username AS synthetic_account,
    ig_account_status,
    bestbehavior_enabled,
    commenting_enabled,
    contentposting_enabled,
    dm_enabled,
    CASE
        WHEN bestbehavior_enabled = TRUE AND ig_account_status IN ('created', 'warming_up') THEN 'WARMING_UP'
        WHEN commenting_enabled = TRUE AND ig_account_status = 'active' THEN 'COMMENTING'
        WHEN contentposting_enabled = TRUE THEN 'CONTENT_POSTING'
        WHEN dm_enabled = TRUE THEN 'DM_ACTIVE'
        ELSE 'ALL_DISABLED'
    END AS primary_mode
FROM families
ORDER BY bestbehavior_enabled DESC, commenting_enabled DESC, id;

-- Usage: SELECT * FROM automation_overview;

-- ============================================================================
-- MIGRATION 6: Apify Instagram Scraper Tables
-- Purpose: Store scraped profile data from mothers' original Instagram accounts
-- Date: 2026-02-06
-- ============================================================================

-- Add flag to families table indicating profile has been scraped
ALTER TABLE families
ADD COLUMN IF NOT EXISTS ig_profile_scraped BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN families.ig_profile_scraped IS 'TRUE if profile has been scraped via Apify';

-- Table: mothers_profiles - Stores scraped profile data from original IG accounts
CREATE TABLE IF NOT EXISTS mothers_profiles (
    id SERIAL PRIMARY KEY,
    family_id INTEGER UNIQUE REFERENCES families(id) ON DELETE CASCADE,
    instagram_username TEXT NOT NULL,
    full_name TEXT,
    biography TEXT,
    profile_pic_url TEXT,
    followers_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    posts_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    external_url TEXT,
    fundraiser_links JSONB DEFAULT '[]'::JSONB, -- Array of extracted fundraiser URLs
    last_scraped_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_mothers_profiles_family ON mothers_profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_mothers_profiles_username ON mothers_profiles(instagram_username);
CREATE INDEX IF NOT EXISTS idx_mothers_profiles_scraped_at ON mothers_profiles(last_scraped_at);

-- Comments
COMMENT ON TABLE mothers_profiles IS 'Scraped Instagram profile data from families original accounts (via Apify)';
COMMENT ON COLUMN mothers_profiles.fundraiser_links IS 'Array of detected fundraiser URLs (GoFundMe, PayPal, etc.)';
COMMENT ON COLUMN mothers_profiles.last_scraped_at IS '24-hour cooldown enforced between scrapes';

-- Table: mothers_content - Stores scraped posts/reels/content
CREATE TABLE IF NOT EXISTS mothers_content (
    id SERIAL PRIMARY KEY,
    family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
    instagram_id TEXT, -- Instagram's internal ID for the post
    short_code TEXT NOT NULL, -- URL slug (e.g., CaBC123)
    content_type TEXT DEFAULT 'post', -- post, reel, video, carousel
    caption TEXT,
    display_url TEXT, -- Image/thumbnail URL
    video_url TEXT, -- Video URL if applicable
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    posted_at TIMESTAMP,
    location_name TEXT,
    hashtags JSONB DEFAULT '[]'::JSONB,
    mentions JSONB DEFAULT '[]'::JSONB,
    is_video BOOLEAN DEFAULT FALSE,
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(family_id, short_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mothers_content_family ON mothers_content(family_id);
CREATE INDEX IF NOT EXISTS idx_mothers_content_posted ON mothers_content(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_mothers_content_type ON mothers_content(content_type);

-- Comments
COMMENT ON TABLE mothers_content IS 'Scraped Instagram content (posts, reels, videos) from families original accounts';
COMMENT ON COLUMN mothers_content.short_code IS 'Instagram URL slug - unique identifier for post';
COMMENT ON COLUMN mothers_content.display_url IS 'Direct URL to image/thumbnail (may expire)';

-- View: Profile scrape status
CREATE OR REPLACE VIEW profile_scrape_status AS
SELECT
    f.id AS family_id,
    f.name AS family_name,
    f.instagram_handle AS original_account,
    f.ig_profile_scraped,
    mp.full_name AS scraped_name,
    mp.followers_count,
    mp.posts_count,
    mp.last_scraped_at,
    CASE
        WHEN mp.last_scraped_at IS NULL THEN 'never_scraped'
        WHEN mp.last_scraped_at < NOW() - INTERVAL '24 hours' THEN 'ready_to_scrape'
        ELSE 'cooling_down'
    END AS scrape_status,
    CASE
        WHEN mp.last_scraped_at IS NULL THEN 0
        ELSE EXTRACT(HOURS FROM (NOW() - mp.last_scraped_at))
    END AS hours_since_scrape,
    COALESCE(jsonb_array_length(mp.fundraiser_links), 0) AS fundraiser_links_count,
    (SELECT COUNT(*) FROM mothers_content mc WHERE mc.family_id = f.id) AS content_count
FROM families f
LEFT JOIN mothers_profiles mp ON f.id = mp.family_id
WHERE f.instagram_handle IS NOT NULL
ORDER BY mp.last_scraped_at DESC NULLS LAST;

-- Usage: SELECT * FROM profile_scrape_status;

-- ============================================================================
-- MIGRATION 7: Backblaze B2 Storage Support
-- Purpose: Add b2_url column for family media uploads stored in B2
-- Date: 2026-02-07
-- ============================================================================

-- Add B2 URL column to media_uploads table
ALTER TABLE media_uploads
ADD COLUMN IF NOT EXISTS b2_url TEXT;

COMMENT ON COLUMN media_uploads.b2_url IS 'Backblaze B2 URL if file stored in B2 (null = Supabase storage)';

-- ============================================================================
-- MIGRATION 8: PalPay Wallet Information
-- Purpose: Store Gaza PalPay wallet details for families
-- Date: 2026-02-10
-- ============================================================================

-- Add PalPay wallet columns
ALTER TABLE families
ADD COLUMN IF NOT EXISTS palpay_phone TEXT,
ADD COLUMN IF NOT EXISTS palpay_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN families.palpay_phone IS 'Gaza PalPay wallet phone number (e.g., 0599123456)';
COMMENT ON COLUMN families.palpay_name IS 'Full name as registered on PalPay wallet';

-- View: Families with PalPay info
SELECT
    id,
    name,
    palpay_phone,
    palpay_name,
    urgent_need_amount
FROM families
WHERE palpay_phone IS NOT NULL
ORDER BY id;

-- ============================================================================
-- MIGRATION 9: Content Description for AI Context
-- Purpose: Add description field to scraped content for AI generation context
-- Date: 2026-02-10
-- ============================================================================

-- Add description column to mothers_content for AI context
ALTER TABLE mothers_content
ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN mothers_content.description IS 'User-provided description/context for AI content generation';

-- ============================================================================
-- MIGRATION 10: Instagram Commenting Algorithm
-- Purpose: Target accounts, comment templates, scheduling, and tracking
-- Date: 2026-02-10
-- ============================================================================

-- 1. Target accounts table (42 pro-Gaza accounts to comment on)
CREATE TABLE IF NOT EXISTS target_accounts (
    id SERIAL PRIMARY KEY,
    handle VARCHAR(100) UNIQUE NOT NULL,
    followers_count INTEGER DEFAULT 0,
    category VARCHAR(50),  -- humanitarian, news, activist, celebrity
    language VARCHAR(10) DEFAULT 'en',
    quality_score NUMERIC(5,2) DEFAULT 50.0,
    total_comments_posted INTEGER DEFAULT 0,
    total_likes_on_comments INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_post_url TEXT,
    last_post_checked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_target_accounts_active ON target_accounts(is_active, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_target_accounts_category ON target_accounts(category);

COMMENT ON TABLE target_accounts IS 'Pro-Gaza Instagram accounts to post comments on';

-- 2. Comment templates table (56 curated comments)
CREATE TABLE IF NOT EXISTS comment_templates (
    id SERIAL PRIMARY KEY,
    template_text TEXT NOT NULL,
    has_fields BOOLEAN DEFAULT FALSE,  -- True if contains [AGE], [X], etc.
    field_requirements JSONB,  -- e.g. {"children_count": true}
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comment_templates_active ON comment_templates(is_active);

COMMENT ON TABLE comment_templates IS 'Curated comment templates for posting';
COMMENT ON COLUMN comment_templates.has_fields IS 'True if template contains replacement fields like [AGE], [X]';

-- 3. Comment schedule table (day-specific posting times)
CREATE TABLE IF NOT EXISTS comment_schedule (
    id SERIAL PRIMARY KEY,
    day_of_week INTEGER NOT NULL,  -- 0=Sun, 1=Mon, 2=Tue, etc.
    time_slot TIME NOT NULL,
    timezone TEXT DEFAULT 'America/New_York',
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(day_of_week, time_slot)
);

COMMENT ON TABLE comment_schedule IS 'Day-specific posting times for comments';

-- 4. Posted comments log (tracking with engagement)
CREATE TABLE IF NOT EXISTS posted_comments (
    id SERIAL PRIMARY KEY,
    family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
    target_account_id INTEGER REFERENCES target_accounts(id),
    template_id INTEGER REFERENCES comment_templates(id),
    post_url TEXT NOT NULL,
    post_shortcode TEXT,
    rendered_comment TEXT NOT NULL,
    posted_at TIMESTAMP DEFAULT NOW(),
    likes_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    last_engagement_check TIMESTAMP,
    status VARCHAR(20) DEFAULT 'posted',  -- posted, deleted, hidden, failed
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posted_comments_family ON posted_comments(family_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_posted_comments_post ON posted_comments(post_url);
CREATE INDEX IF NOT EXISTS idx_posted_comments_template_post ON posted_comments(post_url, template_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posted_comments_no_duplicate_template ON posted_comments(post_url, template_id) WHERE status = 'posted';

COMMENT ON TABLE posted_comments IS 'Log of all comments posted with engagement tracking';

-- Seed 42 target accounts
INSERT INTO target_accounts (handle, followers_count, category, language) VALUES
    ('eye.on.palestine', 13700000, 'news', 'en'),
    ('unicef', 11300000, 'humanitarian', 'en'),
    ('GlobalSumudFlotilla', 3000000, 'activist', 'en'),
    ('wearthepeace', 2200000, 'activist', 'en'),
    ('palestine.pixel', 1500000, 'news', 'en'),
    ('landpalestine', 1700000, 'news', 'en'),
    ('gazafreedomflotilla', 2100000, 'activist', 'en'),
    ('europe.palestine.network', 850000, 'activist', 'en'),
    ('translating_falasteen', 584000, 'news', 'en'),
    ('humantiproject', 555000, 'humanitarian', 'en'),
    ('letstalkpalestine', 1000000, 'news', 'en'),
    ('palestinianvideos', 931000, 'news', 'en'),
    ('wonderful_palestine', 349000, 'news', 'en'),
    ('palestinesolidarityuk', 367000, 'activist', 'en'),
    ('james_unicef', 365000, 'humanitarian', 'en'),
    ('worldfoodprogramme', 1100000, 'humanitarian', 'en'),
    ('unrwa', 497000, 'humanitarian', 'en'),
    ('wissamgaza', 2400000, 'news', 'ar'),
    ('ThousandMadleensToGaza', 156000, 'activist', 'en'),
    ('unicef_mena', 143000, 'humanitarian', 'ar'),
    ('gretathunberg', 16600000, 'celebrity', 'en'),
    ('ajplus', 1900000, 'news', 'en'),
    ('middleeastmonitor', 494000, 'news', 'en'),
    ('doctorswithoutborders', 1200000, 'humanitarian', 'en'),
    ('palestinianyouthmovement', 811000, 'activist', 'en'),
    ('israelscrimes', 102000, 'activist', 'en'),
    ('amnesty', 1200000, 'humanitarian', 'en'),
    ('theintercept', 297000, 'news', 'en'),
    ('aljazeera', 11600000, 'news', 'en'),
    ('hiddenpalestine.archive', 18800, 'news', 'en'),
    ('pal_freepalestine', 72200, 'activist', 'en'),
    ('nouraerakat', 388000, 'activist', 'en'),
    ('palestinesolidaritymvmt', 27500, 'activist', 'en'),
    ('nowinpalestine', 155000, 'news', 'en'),
    ('hinds.call', 190000, 'activist', 'en'),
    ('everydaypalestinee2', 379000, 'news', 'en'),
    ('untoldpalestine', 165000, 'news', 'en'),
    ('gaza24live', 80800, 'news', 'ar'),
    ('actionmtl', 19800, 'activist', 'fr'),
    ('palfest', 107000, 'activist', 'en'),
    ('gameover.israel', 18200, 'activist', 'en'),
    ('trackaipac', 137000, 'activist', 'en')
ON CONFLICT (handle) DO UPDATE SET
    followers_count = EXCLUDED.followers_count,
    category = EXCLUDED.category,
    language = EXCLUDED.language;

-- Seed schedule (NA East Coast times)
INSERT INTO comment_schedule (day_of_week, time_slot) VALUES
    -- Monday
    (1, '07:30'), (1, '11:30'), (1, '20:00'),
    -- Tuesday
    (2, '09:00'), (2, '13:00'), (2, '19:30'),
    -- Wednesday
    (3, '08:00'), (3, '12:30'), (3, '21:00'),
    -- Thursday
    (4, '10:00'), (4, '14:00'), (4, '20:00'),
    -- Friday
    (5, '07:45'), (5, '11:00'), (5, '17:00'),
    -- Saturday
    (6, '10:00'), (6, '14:00'), (6, '18:30'),
    -- Sunday
    (0, '09:30'), (0, '12:00'), (0, '19:45')
ON CONFLICT (day_of_week, time_slot) DO NOTHING;

-- View: Engagement quality report
CREATE OR REPLACE VIEW engagement_quality_report AS
SELECT
    ta.id AS target_account_id,
    ta.handle,
    ta.category,
    ta.followers_count,
    ta.quality_score,
    COUNT(pc.id) AS total_comments,
    COALESCE(SUM(pc.likes_count), 0) AS total_likes,
    COALESCE(SUM(pc.replies_count), 0) AS total_replies,
    COALESCE(AVG(pc.likes_count), 0) AS avg_likes_per_comment,
    ta.last_post_checked_at
FROM target_accounts ta
LEFT JOIN posted_comments pc ON pc.target_account_id = ta.id AND pc.status = 'posted'
GROUP BY ta.id, ta.handle, ta.category, ta.followers_count, ta.quality_score, ta.last_post_checked_at
ORDER BY ta.quality_score DESC;

-- Seed 56 comment templates
-- Static templates (no replacement fields)
INSERT INTO comment_templates (template_text, has_fields, field_requirements) VALUES
    ('My daughter counted the rice grains in our last meal. 47. She divided them among her siblings. 8 each. She kept 7 for herself. She said the youngest needs more to grow. She''s 9. I don''t know when she learned mathematics of hunger', FALSE, NULL),
    ('Last night my son drew our old house from memory. Perfect details. The kitchen where I made his birthday cake. The tree he climbed. Then he drew it again. This time on fire. "So I remember both," he said. He''s 6.', FALSE, NULL),
    ('My 11-year-old daughter started her period yesterday. In a tent. In winter. No privacy. No supplies. She apologized for becoming a woman at the wrong time. I had nothing to give her but torn fabric and silence.', FALSE, NULL),
    ('Today my children played "restaurant." They served invisible food on broken plates. Took turns being the customer who could afford to eat. The winner was whoever could describe the food best without crying. Nobody won.', FALSE, NULL),
    ('My son sleeps holding his baby sister''s hand. Not from love. From fear. If the tent collapses in the night, he doesn''t want to lose her in the dark. He practiced finding her by touch. Eyes closed. Counting seconds.', FALSE, NULL),
    ('The doctor wrote three prescriptions yesterday. For three of my children. Then he looked at me. We both knew. The pharmacy has the medicine. Behind glass. Like their futures. $30, $25, $40. He wrote them anyway. Hope on paper.', FALSE, NULL),
    ('My 5-year-old asked why we don''t turn on the lights anymore. I said we''re saving electricity. She said "for what?" I couldn''t answer. She said "it''s okay mama, I see better in the dark now anyway." She does.', FALSE, NULL),
    ('This morning my daughter gave her bread to her brother. He gave it to the baby. The baby can''t eat bread yet. We all watched it get soft in her tiny hands. Nobody took it back. Hunger has its own honor.', FALSE, NULL),
    ('Found my son writing numbers on the tent wall. Not random. Dates. Every time someone leaves and doesn''t come back. He said he''s keeping count so God doesn''t have to. 47 dates. He ran out of wall.', FALSE, NULL),
    ('My daughter learned to braid her sister''s hair in complete darkness. By touch. She said bombs teach you to love without needing light. Yesterday she braided my hair too. First time since October. We pretended morning would come.', FALSE, NULL),
    ('My 4-year-old built a hospital from rubble yesterday. Put her doll inside. Said the doll has what daddy had. I asked what medicine the doll needs. She said "the kind that exists." Then she buried it. Said sometimes that''s the medicine.', FALSE, NULL),
    ('Found my son teaching himself to write with charcoal on concrete. Not the alphabet. Times of day. "For when I have a watch," he said. It''s been 6 months since he''s seen a working clock. He still believes in "when." I don''t correct him.', FALSE, NULL),
    ('The baby learned to sleep through explosions but wakes when her brother coughs. Nature programs survival in ways that break you. She knows which sound means danger now. A cough. In winter. In a tent. Her survival instinct is perfect and useless.', FALSE, NULL),
    ('My daughter asked why we wash the same dress every day. I said it''s her favorite. She said no, it''s her only. Asked if she minded. She said "I mind that you lie about it." She''s 8. The dress has 47 carefully mended holes. She counts them like stars.', FALSE, NULL),
    ('Today would have been my son''s 10th birthday. His siblings made a cake from mud. Sang the song. Blew out pretend candles. The 5-year-old asked when he''s coming back from heaven for his cake. Nobody answered. She wrapped a piece in paper for later.', FALSE, NULL),
    ('My son stopped asking for food. Stopped crying. Doctor said it''s the final stage before the body shuts down. I begged him to cry. To ask. To demand. He said "I''m saving my energy to say goodbye properly." He''s 6. He''s planning his last words.', FALSE, NULL),
    ('The school bag survived the bombing. Nothing else. My daughter carries it everywhere. Empty. Says she''s keeping it ready for when school comes back. Yesterday I found her teaching math to the bag. "So it doesn''t forget its purpose," she said.', FALSE, NULL),
    ('My diabetic son counts his insulin units like a banker. 14 left. Each one is 3 days if he eats nothing. 5 days if he "sleeps more." He made a chart. Drew hearts next to the days he thinks are worth staying awake for. His sister''s birthday has three hearts.', FALSE, NULL),
    ('My children play a game called "normal day." They pretend to miss the school bus. Complain about homework. Fight over TV channels that don''t exist. Yesterday the youngest said "I don''t want to play anymore. I forgot how it ends." None of us remember how normal days ended.', FALSE, NULL),
    ('Last night my daughter held a funeral for her childhood. Said it died at 7 years and 3 months. Made a speech. "It was beautiful while it lasted. It believed in tomorrow." Then she asked me to help bury her toys. Said dead things shouldn''t have to see what comes next.', FALSE, NULL),
    ('My daughter practices her future wedding dance alone in the tent. No music. Just humming. She''s 10. Yesterday she asked if dead girls can still get married in heaven. I said yes. She looked relieved.', FALSE, NULL),
    ('My children invented a new prayer. Not for food or safety. For forgetting. "Make us forget ice cream existed. Make us forget our beds. Make us forget." They''re 5 and 7. Memory hurts more than hunger.', FALSE, NULL),
    ('The bomb took our neighbors at 3:47 AM. My daughter knows the exact time. Not because she has a watch. Because she counts. Every second since. She''s at 97,000. Still counting.', FALSE, NULL),
    ('My 4-year-old asked if we''re refugees or humans. I said both. She said "No mama, pick one." I couldn''t. She picked for me: "Today we''re humans." I didn''t ask about tomorrow.', FALSE, NULL),
    ('My son traded his shoes for antibiotics. For his sister. The medicine was expired. We gave it anyway. She lived. Now he measures distances by how much his feet bleed. School is 500 drops away.', FALSE, NULL),
    ('"Are we practice people?" my daughter asked. "For God to learn what not to do?" She''s 8. I said no, we''re real. She touched her ribs, counting. "These feel like practice bones."', FALSE, NULL),
    ('My children don''t play "house" anymore. They play "evacuation." Each knows what to grab. The 4-year-old''s job is the baby. Yesterday she practiced carrying him while running. Dropped him twice. Cried both times. Not because she hurt him. Because in real evacuation, twice means dead.', FALSE, NULL),
    ('Found my daughter''s notebook. She''s keeping a "hunger diary." Day 1: stomach hurts. Day 15: stopped hurting. Day 30: forgot what full means. Day 47: decided hungry is normal. She''s 9. I burned the notebook. She started a new one.', FALSE, NULL),
    ('"Why do we wash dead people but not live ones?" my son asked. We haven''t bathed properly in weeks. I said the dead deserve dignity. He said "So do we." He''s 6. He won. We used drinking water. Just this once.', FALSE, NULL),
    ('My daughter made herself a birthday card. From her dead friend. "I know she would remember," she explained. Inside: "Sorry I can''t come. I''m busy being dead. Save me cake." She saved a piece. It molded. She saved that too.', FALSE, NULL),
    ('My son measured our tent with his body. Four of him wide. Six of him long. "When I grow," he said, "we''ll need a bigger tent." He still believes in when. He still believes in growing. I let him measure twice.', FALSE, NULL),
    ('My son asked if anger is heavier than sadness. Said he''s too tired to carry both. Needs to pick one. He''s 7. I told him sadness weighs less. He said "Then why does everyone choose anger?" I had no answer.', FALSE, NULL),
    ('"Do fathers in heaven watch their kids?" my daughter asked. "Like security cameras?" I said yes. She waved at the sky. "Hi Baba. I''m being good. Mama''s tired. Come back." She''s 5. She waves every night.', FALSE, NULL),
    ('My daughter asked where the judges who stop bad things went. I said they''re still there. She said "No mama, they''re pretending to be asleep so they don''t have to see." Then she buried her toy hammer from better days. Said even pretend justice deserves a grave. She''s 7.', FALSE, NULL),
    ('"Why do bombs work but prayers don''t?" my daughter asked. I said prayers work differently. She said "Yes, bombs work immediately." She''s 8. She keeps praying anyway. Says maybe God is collecting them all for one big answer.', FALSE, NULL),
    ('My son divides time differently now. Not days or weeks. "Before everyone died" and "After everyone died." Yesterday he asked which period baby sister was born in. I couldn''t answer. She''s 6 months old. Both answers are true.', FALSE, NULL),
    ('Found my daughter teaching her doll the new alphabet. A is for Aid that doesn''t come. B is for Bombs that do. C is for Ceasefire that isn''t. She got to Z: Zooming sounds before the explosion. The doll failed the test. "She still believes in A," she explained.', FALSE, NULL),
    ('My son asked if rich people''s children also drink rain from tarps. I said no. He asked what they drink. I said clean water from taps. He said "Imagine being that lucky." Then added: "But imagine being that guilty." He''s 9.', FALSE, NULL),
    ('"When we die, do we get our old house back?" my daughter asked. In heaven, I said. "Then I want to die before I forget what it looked like." She''s trying to remember her room. Can''t. She''s 5. Five years old and planning her death for memory''s sake.', FALSE, NULL),
    ('My children play "Court." They put bombs on trial. Found them guilty. Sentenced them to life in prison. Then laughed. "Bombs don''t go to prison, mama. They go to children." They''re 6 and 8. They know how justice actually works.', FALSE, NULL),
    ('My son buried a paper that said "International Law" on it. I asked why. "It was already dead. I''m just being polite." He made a speech: "It protected nobody. It saved nobody. But it tried to exist. That''s something." He''s 7. He understands mercy better than judges.', FALSE, NULL),
    ('Found my daughter teaching math to empty chairs. "My classmates," she explained. "They''re just invisible now, not gone." She takes attendance daily. Marks 29 absent. Won''t accept they''re never coming.', FALSE, NULL),
    ('The thunder made my son smile yesterday. "It sounds like bombs but nothing falls," he said. "Maybe God is practicing missing." He''s 6. He thinks God needs practice at mercy.', FALSE, NULL),
    ('My daughter asked what language angels speak. I said all languages. She said "Then why don''t they understand ''help''?" She''s 7. She''s been praying in 3 languages. Still waiting.', FALSE, NULL),
    ('My daughter made a calendar. Not of days. Of "almosts." Almost died: 47 marks. Almost got food: 12. Almost found shelter: 8. She''s 10. She counts near-misses like treasures.', FALSE, NULL),
    ('Found my daughters playing "before and after." They take turns remembering things. The one who cries first loses. They always tie. They''re 6 and 8. Memory is their only toy.', FALSE, NULL),
    ('My son buried his baby tooth with a note: "For the tooth fairy after the war." I didn''t tell him she doesn''t visit war zones. He''s 5. He still believes in after.', FALSE, NULL),
    ('Seven children. Two can''t walk. Neither can their father. My 10-year-old carries his brother when bombs fall. My 8-year-old feeds her sister every spoonful. Yesterday she asked: "If we lose the apartment, who do we save first?" I couldn''t answer. She already knew.', FALSE, NULL)
ON CONFLICT DO NOTHING;

-- Templates with replacement fields
INSERT INTO comment_templates (template_text, has_fields, field_requirements) VALUES
    ('I have [X] children. This morning I counted [X-1]. For three seconds I couldn''t remember who was missing. Then I did. The brain protects itself in ways that break you later. My [AGE]-year-old said "It''s okay mama, sometimes I forget too." We were talking about her sister. Dead 40 days.', TRUE, '{"children_count": true, "children_ages": true}'::jsonb),
    ('My [AGE]-year-old can''t walk. Can''t speak. But understands everything. When the bombs fall, his eyes ask questions I can''t answer. Yesterday he grabbed my hand during an explosion. First time in months. Not from love. From knowing. He knows what we don''t say out loud. He''s already said goodbye in his own way.', TRUE, '{"children_ages": true}'::jsonb),
    ('14 insulin units left. My [AGE]-year-old son did the math: 3 days per unit if he eats nothing. 5 days if he "sleeps more." He marked his sister''s birthday on the calendar. Drew hearts. "I''ll save 2 units for that day, mama. To be awake." She doesn''t know her party depends on his survival math.', TRUE, '{"children_ages": true}'::jsonb),
    ('The baby is [AGE]. Too young to understand war. Old enough to understand gone. Points at the door waiting for her father. We buried him 71 days ago. She still points. Still waits. My [OLDER]-year-old told her "Baba went to get food." Now she points at empty plates too.', TRUE, '{"children_ages": true}'::jsonb),
    ('Born with a hole in her heart. [AGE] years old. Needs a nebulizer. In America: $60. In Egypt: $90. In Gaza: $300. My daughter''s heart costs more here because hearts are bad for business during genocide. She breathes 30 times per minute. Normal is 20. I count every extra breath as theft.', TRUE, '{"children_ages": true}'::jsonb),
    ('My [AGE]-year-old memorized which aid trucks have medicine. Not from hope. From pattern recognition. "The white ones never do. The green sometimes. The red ones used to." She''s creating survival statistics. Yesterday she said "We have 0% chance today mama. All trucks are white." She was right.', TRUE, '{"children_ages": true}'::jsonb),
    ('[NUMBER] children. [NUMBER] different ways to be hungry. The [AGE]-year-old cries. The [AGE]-year-old goes silent. The [AGE]-year-old makes jokes that aren''t funny. "My stomach is practicing being empty for when I''m dead." We laughed. What else could we do?', TRUE, '{"children_count": true, "children_ages": true}'::jsonb)
ON CONFLICT DO NOTHING;

-- Function to increment template usage count
CREATE OR REPLACE FUNCTION increment_template_usage(template_id INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE comment_templates
    SET usage_count = usage_count + 1
    WHERE id = template_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update target account quality scores (run daily)
CREATE OR REPLACE FUNCTION update_target_quality_scores()
RETURNS void AS $$
BEGIN
    UPDATE target_accounts ta
    SET
        quality_score = COALESCE(
            (
                SELECT
                    CASE
                        WHEN COUNT(pc.id) = 0 THEN 50.0
                        ELSE LEAST(100,
                            ((COALESCE(SUM(pc.likes_count), 0) + COALESCE(SUM(pc.replies_count), 0) * 3.0) / GREATEST(COUNT(pc.id), 1))
                            / (LN(GREATEST(ta.followers_count, 1000)) * 0.1)
                            * 100
                        )
                    END
                FROM posted_comments pc
                WHERE pc.target_account_id = ta.id
                  AND pc.posted_at > NOW() - INTERVAL '30 days'
                  AND pc.status = 'posted'
            ),
            50.0
        ),
        total_comments_posted = (
            SELECT COUNT(*) FROM posted_comments pc
            WHERE pc.target_account_id = ta.id AND pc.status = 'posted'
        ),
        total_likes_on_comments = (
            SELECT COALESCE(SUM(likes_count), 0) FROM posted_comments pc
            WHERE pc.target_account_id = ta.id AND pc.status = 'posted'
        )
    WHERE ta.is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION 11: Engaged Followers Backup
-- Purpose: Store likers/commenters from family posts as backup contacts
-- Date: 2026-02-11
-- ============================================================================

-- Table to store engaged followers (likers and commenters on family posts)
CREATE TABLE IF NOT EXISTS engaged_followers (
    id SERIAL PRIMARY KEY,
    family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    full_name TEXT,
    profile_pic_url TEXT,
    engagement_type VARCHAR(20) NOT NULL,  -- 'like', 'comment'
    post_shortcode TEXT,                    -- Which post they engaged with
    engagement_count INTEGER DEFAULT 1,     -- How many times they've engaged
    first_seen_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(family_id, username)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_engaged_followers_family ON engaged_followers(family_id);
CREATE INDEX IF NOT EXISTS idx_engaged_followers_username ON engaged_followers(username);
CREATE INDEX IF NOT EXISTS idx_engaged_followers_type ON engaged_followers(engagement_type);
CREATE INDEX IF NOT EXISTS idx_engaged_followers_last_seen ON engaged_followers(last_seen_at DESC);

-- Comments
COMMENT ON TABLE engaged_followers IS 'Backup of users who liked/commented on family posts - for re-engagement if account suspended';
COMMENT ON COLUMN engaged_followers.engagement_type IS 'Type of engagement: like, comment';
COMMENT ON COLUMN engaged_followers.engagement_count IS 'Total times this user has engaged with family content';
COMMENT ON COLUMN engaged_followers.post_shortcode IS 'Most recent post they engaged with';

-- Add last_followers_backup timestamp to families table
ALTER TABLE families
ADD COLUMN IF NOT EXISTS last_followers_backup_at TIMESTAMP;

COMMENT ON COLUMN families.last_followers_backup_at IS 'Timestamp of last engaged followers backup';

-- View: Engaged followers summary per family
CREATE OR REPLACE VIEW engaged_followers_summary AS
SELECT
    f.id AS family_id,
    f.name AS family_name,
    f.instagram_handle,
    COUNT(ef.id) AS total_engaged_followers,
    COUNT(CASE WHEN ef.engagement_type = 'like' THEN 1 END) AS likers_count,
    COUNT(CASE WHEN ef.engagement_type = 'comment' THEN 1 END) AS commenters_count,
    MAX(ef.last_seen_at) AS most_recent_engagement,
    f.last_followers_backup_at
FROM families f
LEFT JOIN engaged_followers ef ON f.id = ef.family_id
WHERE f.instagram_handle IS NOT NULL
GROUP BY f.id, f.name, f.instagram_handle, f.last_followers_backup_at
ORDER BY total_engaged_followers DESC;

-- Usage: SELECT * FROM engaged_followers_summary;

-- ============================================================================
-- MIGRATION 12: Family Members for AI Content Generation
-- Purpose: Store detailed info about each family member for fal.ai video generation
-- Date: 2026-02-11
-- ============================================================================

-- Table to store individual family members with AI-relevant details
CREATE TABLE IF NOT EXISTS family_members (
    id SERIAL PRIMARY KEY,
    family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,           -- 'child', 'mother', 'father', 'grandparent', 'sibling'
    age INTEGER,                          -- Current age (NULL for adults if unknown)
    gender VARCHAR(20),                   -- 'male', 'female', 'other'
    description TEXT,                     -- Physical/personality traits for AI prompts
    reference_photo_url TEXT,             -- B2 URL of their reference photo
    is_primary BOOLEAN DEFAULT FALSE,     -- Primary subject for content
    display_order INTEGER DEFAULT 0,      -- Order to display in UI
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_role ON family_members(role);

-- Comments
COMMENT ON TABLE family_members IS 'Individual family members with details for AI content generation';
COMMENT ON COLUMN family_members.role IS 'Family role: child, mother, father, grandparent, sibling';
COMMENT ON COLUMN family_members.description IS 'Physical traits and personality for AI video prompts (e.g., "brown eyes, curly hair, playful")';
COMMENT ON COLUMN family_members.reference_photo_url IS 'B2 storage URL of reference photo for AI element matching';
COMMENT ON COLUMN family_members.is_primary IS 'Primary subject when generating content';

-- Helper view: Get family with all members
CREATE OR REPLACE VIEW family_with_members AS
SELECT
    f.id AS family_id,
    f.name AS family_name,
    f.instagram_handle,
    fm.id AS member_id,
    fm.name AS member_name,
    fm.role,
    fm.age,
    fm.gender,
    fm.description,
    fm.reference_photo_url,
    fm.is_primary
FROM families f
LEFT JOIN family_members fm ON f.id = fm.family_id
ORDER BY f.id, fm.display_order, fm.age DESC NULLS LAST;

-- Function to get AI prompt context for a family
CREATE OR REPLACE FUNCTION get_family_ai_context(p_family_id INTEGER)
RETURNS TEXT AS $$
DECLARE
    context TEXT := '';
    member RECORD;
    idx INTEGER := 1;
BEGIN
    FOR member IN
        SELECT name, role, age, gender, description
        FROM family_members
        WHERE family_id = p_family_id
        ORDER BY display_order, age DESC NULLS LAST
    LOOP
        context := context || '@Element' || idx || ' is ' || member.name;

        IF member.age IS NOT NULL THEN
            context := context || ', a ' || member.age || '-year-old';
        END IF;

        IF member.gender IS NOT NULL THEN
            context := context || ' ' || member.gender;
        END IF;

        context := context || ' ' || member.role;

        IF member.description IS NOT NULL AND member.description != '' THEN
            context := context || ' (' || member.description || ')';
        END IF;

        context := context || '. ';
        idx := idx + 1;
    END LOOP;

    RETURN TRIM(context);
END;
$$ LANGUAGE plpgsql;

-- Usage: SELECT get_family_ai_context(1);
-- Returns: "@Element1 is Abud, a 3-year-old male child (brown eyes, curly hair). @Element2 is Eylul, a 4-year-old female child (dark hair, shy smile)."

-- Migration: Add instagram_password_enabled field for admin control
-- Run this in Supabase SQL Editor
ALTER TABLE families
ADD COLUMN IF NOT EXISTS instagram_password_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN families.instagram_password_enabled IS 'Admin toggle to allow family to enter Instagram password (for account recovery/limited accounts)';
