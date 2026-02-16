# Database Migration: Add Deceased Relative Tracking

## Description
Add new columns to the `family_members` table to track deceased relatives and their relationship to the account holder.

## SQL Migration Script

```sql
-- Add columns to track deceased relatives in family_members table
ALTER TABLE family_members 
ADD COLUMN IF NOT EXISTS relationship TEXT,
ADD COLUMN IF NOT EXISTS is_deceased BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS days_since_death INTEGER;

-- Add comments to describe the new columns
COMMENT ON COLUMN family_members.relationship IS 'Relationship to account holder (Son, Daughter, Husband, etc.)';
COMMENT ON COLUMN family_members.is_deceased IS 'Whether the family member is deceased';
COMMENT ON COLUMN family_members.days_since_death IS 'Number of days since death (if deceased)';
```

## Column Details

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| relationship | TEXT | NULL | Relationship to account holder (Son, Daughter, Husband, etc.) |
| is_deceased | BOOLEAN | FALSE | Whether the family member is deceased |
| days_since_death | INTEGER | NULL | Number of days since death (if deceased) |

## Implementation Notes

1. The `relationship` column will store values like "Son", "Daughter", "Husband", "Nephew", "Niece", "Mother", "Father", "Brother", "Sister"
2. The `is_deceased` column is a boolean flag to indicate if the family member has passed away
3. The `days_since_death` column stores the number of days since the family member's death (only relevant when `is_deceased` is TRUE)