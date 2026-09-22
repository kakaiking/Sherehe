-- Guest-facing event partners showcase (admin-managed; not ticket-claim accounts).

CREATE TABLE IF NOT EXISTS event_partners (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  phone VARCHAR(16) NOT NULL,
  email VARCHAR(255) NOT NULL,
  logo_mime VARCHAR(64) NOT NULL,
  logo_data BYTEA NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_partners_event_sort
  ON event_partners (event_id, sort_order, created_at);
