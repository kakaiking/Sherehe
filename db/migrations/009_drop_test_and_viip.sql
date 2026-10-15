-- Remove the KSh 10 probe ticket and VIIP from the live catalog.
-- Issued tickets and past order lines keep their codes.
DELETE FROM sale_windows WHERE ticket_code IN ('test', 'viip');
DELETE FROM ticket_types WHERE code IN ('test', 'viip');
