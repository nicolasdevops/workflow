-- Add fundraising_url column to families table
-- Run this in Supabase SQL Editor

ALTER TABLE families
ADD COLUMN IF NOT EXISTS fundraising_url TEXT;

-- Optional: Add an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_families_id ON families(id);

-- Example usage:
-- UPDATE families SET fundraising_url = 'https://chuffed.org/campaign/sarah-gaza-family' WHERE id = 1;
