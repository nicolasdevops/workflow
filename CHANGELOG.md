# Changelog

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
