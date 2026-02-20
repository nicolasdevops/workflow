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

-- ============================================================================
-- MIGRATION 13: Comment Template Engine + Pre-Generated Comments
-- Purpose: Rich template variable system, per-family config, pre-generated comments
-- Date: 2026-02-20
-- ============================================================================

-- Extend comment_templates with richer metadata
ALTER TABLE comment_templates
ADD COLUMN IF NOT EXISTS template_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS original_text TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS word_count INTEGER;

COMMENT ON COLUMN comment_templates.template_id IS 'Unique string ID matching templates.json (e.g. fever_mathematics)';
COMMENT ON COLUMN comment_templates.original_text IS 'Original untemplatized version of the comment';
COMMENT ON COLUMN comment_templates.category IS 'Category: death_loss, medical_crisis, hunger, cold, displacement, innocence, daily_survival';
COMMENT ON COLUMN comment_templates.requirements IS 'Template eligibility requirements (min_children, needs_deceased_parent, age_constraints, etc.)';

-- Per-family template configuration (overrides, locks, child assignments)
CREATE TABLE IF NOT EXISTS family_template_config (
    id SERIAL PRIMARY KEY,
    family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
    template_overrides JSONB DEFAULT '{}',
    variable_locks JSONB DEFAULT '{}',
    child_assignments JSONB DEFAULT '{}',
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(family_id)
);

COMMENT ON TABLE family_template_config IS 'Per-family template variable overrides and locks for comment generation';
COMMENT ON COLUMN family_template_config.template_overrides IS 'Numeric range overrides: {"insulin_units": {"min": 12, "max": 18}}';
COMMENT ON COLUMN family_template_config.variable_locks IS 'Locked variable values: {"classmates_count": 29}';
COMMENT ON COLUMN family_template_config.child_assignments IS 'Manual child->slot mapping: {"child1": 2, "child2": 0}';

-- Pre-generated comments pool (admin reviews before scheduler posts)
CREATE TABLE IF NOT EXISTS family_generated_comments (
    id SERIAL PRIMARY KEY,
    family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
    template_id INTEGER REFERENCES comment_templates(id),
    rendered_text TEXT NOT NULL,
    variables_used JSONB,
    status TEXT DEFAULT 'pending',  -- pending, approved, posted, rejected
    posted_to_url TEXT,
    posted_at TIMESTAMPTZ,
    target_account_id INTEGER,
    likes_count INTEGER DEFAULT 0,
    likes_last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fgc_family ON family_generated_comments(family_id);
CREATE INDEX IF NOT EXISTS idx_fgc_status ON family_generated_comments(status);
CREATE INDEX IF NOT EXISTS idx_fgc_posted ON family_generated_comments(posted_at) WHERE status = 'posted';

COMMENT ON TABLE family_generated_comments IS 'Pre-generated comments awaiting admin approval before posting';
COMMENT ON COLUMN family_generated_comments.status IS 'Lifecycle: pending -> approved -> posted (or rejected)';
COMMENT ON COLUMN family_generated_comments.likes_count IS 'Number of likes on the posted comment, checked periodically';
