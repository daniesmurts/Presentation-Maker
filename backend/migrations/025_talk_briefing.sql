-- The one-page briefing («Памятка», TODO O4): one model call over the
-- finished slides, stored on the talk like the slides themselves. Nullable
-- — made on request, regenerated on request. Expand-only (CLAUDE.md §3.11).
ALTER TABLE talks ADD COLUMN IF NOT EXISTS briefing JSONB;
