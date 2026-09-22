-- Scheduled flash sale window: start time so admins can arm before go-live.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS flash_starts_at TIMESTAMPTZ NULL;
