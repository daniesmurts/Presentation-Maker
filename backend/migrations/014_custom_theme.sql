-- Design v3, L3: one custom theme per workspace — a full Theme JSON
-- (shared/themes.ts), written only through validateTheme(). Generated from
-- a description, derived from the brand accent, or read out of an uploaded
-- .pptx; picked on a talk as theme_id = 'custom'. Expand-only.
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS custom_theme JSONB;
