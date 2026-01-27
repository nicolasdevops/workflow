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
