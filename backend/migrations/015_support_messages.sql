-- Public contact / tech-support form (unauthenticated — no workspace_id).
-- `category` splits general inquiries from support tickets in the same
-- table; there is no queue or notifier yet, this is just durable capture.
CREATE TABLE support_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT NOT NULL CHECK (category IN ('general', 'support', 'billing')),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
