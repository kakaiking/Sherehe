-- Discrete flash-sale calendar days (YYYY-MM-DD in Africa/Nairobi).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS flash_dates JSONB NOT NULL DEFAULT '[]'::jsonb;
