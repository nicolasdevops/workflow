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
