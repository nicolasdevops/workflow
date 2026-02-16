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
