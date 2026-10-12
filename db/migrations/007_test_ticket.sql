-- KSh 5 Paystack probe. Ten seats sit on top of the 300 pool (pool is 310).
INSERT INTO ticket_types (id, event_id, code, name, price_ksh, seats_per_unit, capacity, sort_order)
SELECT gen_random_uuid(), e.id, 'test', 'Test Ticket', 5, 1, 10, 0
FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_types t WHERE t.event_id = e.id AND t.code = 'test'
);

INSERT INTO sale_windows (id, event_id, ticket_code, starts_at, ends_at)
SELECT gen_random_uuid(), e.id, 'test', NOW() - INTERVAL '1 day', NULL
FROM events e
WHERE NOT EXISTS (
  SELECT 1 FROM sale_windows w WHERE w.event_id = e.id AND w.ticket_code = 'test'
);
