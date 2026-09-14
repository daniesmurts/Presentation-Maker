-- Deck-level rewrite (CLAUDE.md §5.7) runs as a job like generation but
-- ends in a PROPOSAL, not a write: `proposal` holds the rewritten slides
-- until the user accepts them slide by slide. `kind` tells the two apart
-- ('generate' | 'rewrite'); the request column carries what each needs.
-- Expand-only: existing rows are 'generate'.

ALTER TABLE talk_jobs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'generate';
ALTER TABLE talk_jobs ADD COLUMN IF NOT EXISTS proposal JSONB;
