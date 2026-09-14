-- Brand kit per workspace (CLAUDE.md §4, §5.2): accent, logo, name. One
-- row per workspace; palette/fonts/template columns arrive when there is a
-- UI for them (expand-only). The logo lives in object storage; the row
-- carries its intrinsic size so the title slide fits it by aspect ratio.

CREATE TABLE IF NOT EXISTS brand_kits (
  workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  -- 6-digit hex without '#', validated at the boundary (lib/brandColor.ts)
  accent        TEXT,
  name          TEXT,
  logo_path     TEXT,
  logo_mime     TEXT,
  logo_width    INTEGER,
  logo_height   INTEGER,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
