-- Early Bird is KSh 2,000 through 31 Oct 2026 23:59 Nairobi (closes 1 Nov 00:00).
-- Flash Sale is KSh 2,800.
UPDATE ticket_types SET price_ksh = 2000 WHERE code = 'early_bird';
UPDATE ticket_types SET price_ksh = 2800 WHERE code = 'flash';

UPDATE sale_windows
SET ends_at = TIMESTAMPTZ '2026-11-01 00:00:00+03'
WHERE ticket_code = 'early_bird';

INSERT INTO sale_windows (id, event_id, ticket_code, starts_at, ends_at)
SELECT gen_random_uuid(), e.id, 'early_bird', NOW() - INTERVAL '1 day', TIMESTAMPTZ '2026-11-01 00:00:00+03'
FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM sale_windows w WHERE w.event_id = e.id AND w.ticket_code = 'early_bird'
);
