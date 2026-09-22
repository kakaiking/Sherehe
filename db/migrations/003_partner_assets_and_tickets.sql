-- Partner signup assets (logo + terms contract) and one-time free team tickets.

ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS service_offered VARCHAR(200) NOT NULL DEFAULT '';

ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS logo_mime VARCHAR(64) NULL;

ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS logo_data BYTEA NULL;

ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS contract_mime VARCHAR(64) NULL;

ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS contract_data BYTEA NULL;

ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS ticket_order_id CHAR(36) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_applications_ticket_order_id_fkey'
  ) THEN
    ALTER TABLE partner_applications
      ADD CONSTRAINT partner_applications_ticket_order_id_fkey
      FOREIGN KEY (ticket_order_id) REFERENCES orders (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_ticket_order
  ON partner_applications (ticket_order_id)
  WHERE ticket_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_one_open_application
  ON partner_applications (partner_id)
  WHERE status IN ('pending', 'confirmed');
