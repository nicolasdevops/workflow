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

-- Create proxy_cities lookup table with 7 rotation cities
CREATE TABLE IF NOT EXISTS proxy_cities (
    id SERIAL PRIMARY KEY,
    city_name TEXT UNIQUE NOT NULL,
    city_key TEXT UNIQUE NOT NULL, -- Lowercase key for Decodo (e.g., 'beirut')
    country_code TEXT NOT NULL,    -- ISO 2-letter code (e.g., 'lb')
    timezone TEXT NOT NULL,         -- IANA timezone (e.g., 'Asia/Beirut')
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    network_provider TEXT,          -- Optional: ISP name for reference
    rotation_order INTEGER UNIQUE NOT NULL -- Order in rotation (1-7)
);

-- Insert the 7 rotation cities
INSERT INTO proxy_cities (city_name, city_key, country_code, timezone, latitude, longitude, network_provider, rotation_order)
VALUES
    ('Beirut', 'beirut', 'lb', 'Asia/Beirut', 33.8886, 35.4955, 'Alfa/Touch', 1),
    ('Sarajevo', 'sarajevo', 'ba', 'Europe/Sarajevo', 43.8563, 18.4131, 'BH Telecom', 2),
    ('Paris', 'paris', 'fr', 'Europe/Paris', 48.8566, 2.3522, 'Orange/SFR', 3),
    ('Chicago', 'chicago', 'us', 'America/Chicago', 41.8781, -87.6298, 'AT&T/Verizon', 4),
    ('San Francisco', 'sanfrancisco', 'us', 'America/Los_Angeles', 37.7749, -122.4194, 'AT&T/T-Mobile', 5),
    ('Montreal', 'montreal', 'ca', 'America/Montreal', 45.5017, -73.5673, 'Videotron/Bell', 6),
    ('Quebec City', 'quebec', 'ca', 'America/Toronto', 46.8139, -71.2080, 'Videotron/Bell', 7)
ON CONFLICT (city_key) DO NOTHING;

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

    -- Calculate next rotation index (modulo 7 for 7 cities)
    next_rotation_index = (total_families % 7) + 1;

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

-- Function: Auto-assign city to a specific family
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
        SELECT instagram_handle
        FROM families
        WHERE instagram_handle IS NOT NULL
        AND (proxy_city IS NULL OR proxy_city = 'montreal') -- Update null or default only
        ORDER BY id
    LOOP
        PERFORM assign_proxy_city(family_record.instagram_handle);
    END LOOP;
END $$;

-- Verify rotation assignments
SELECT
    f.instagram_handle,
    f.proxy_city,
    f.proxy_country,
    f.timezone,
    pc.rotation_order,
    pc.network_provider
FROM families f
LEFT JOIN proxy_cities pc ON f.proxy_city = pc.city_key
WHERE f.instagram_handle IS NOT NULL
ORDER BY pc.rotation_order, f.instagram_handle;

-- Manual assignment examples (if needed)
-- SELECT assign_proxy_city('sarah_gaza_voice');  -- Assigns next city in rotation
-- SELECT assign_proxy_city('ahmed_gaza_stories'); -- Assigns next city

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
    family_name,
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
    family_name,
    ig_email,
    ig_username,
    ig_account_created_at,
    ig_account_status,
    proxy_city
FROM families
WHERE ig_account_status IN ('created', 'verified', 'active')
ORDER BY ig_account_created_at DESC;

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
