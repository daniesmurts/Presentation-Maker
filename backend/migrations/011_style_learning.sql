-- Style learning from approved talks (CLAUDE.md §2 selectExemplars):
-- consent-gated per workspace, off by default. `talks.approved_at` («Готово»)
-- already exists; only an approved talk's slides are ever used as style
-- references — model output is not a training signal until a person has
-- stood behind it.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS style_learning BOOLEAN NOT NULL DEFAULT FALSE;
