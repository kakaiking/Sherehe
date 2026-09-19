-- Split guest, partner, and vendor identities so one email can exist in all
-- three tables, each with its own id. Idempotent for DBs that already ran 001.

CREATE TABLE IF NOT EXISTS partners (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NULL,
  given_name VARCHAR(40) NULL,
  google_sub VARCHAR(255) NULL,
  phone VARCHAR(16) NULL,
  password_hash VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_partners_email UNIQUE (email),
  CONSTRAINT uq_partners_phone UNIQUE (phone),
  CONSTRAINT uq_partners_google_sub UNIQUE (google_sub)
);

CREATE TABLE IF NOT EXISTS vendors (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NULL,
  given_name VARCHAR(40) NULL,
  google_sub VARCHAR(255) NULL,
  phone VARCHAR(16) NULL,
  password_hash VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vendors_email UNIQUE (email),
  CONSTRAINT uq_vendors_phone UNIQUE (phone),
  CONSTRAINT uq_vendors_google_sub UNIQUE (google_sub)
);

INSERT INTO partners (id, email, display_name, given_name, google_sub, phone, password_hash, created_at)
SELECT id, email, display_name, given_name, google_sub, phone, password_hash, created_at
FROM users
WHERE role = 'partner'
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (id, email, display_name, given_name, google_sub, phone, password_hash, created_at)
SELECT id, email, display_name, given_name, google_sub, phone, password_hash, created_at
FROM users
WHERE role = 'vendor'
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partner_applications'
      AND column_name = 'user_id'
  ) THEN
    INSERT INTO partners (id, email, display_name, given_name, google_sub, phone, password_hash, created_at)
    SELECT u.id, u.email, u.display_name, u.given_name, u.google_sub, u.phone, u.password_hash, u.created_at
    FROM users u
    WHERE u.id IN (SELECT user_id FROM partner_applications)
    ON CONFLICT (id) DO NOTHING;
    ALTER TABLE partner_applications DROP CONSTRAINT IF EXISTS partner_applications_user_id_fkey;
    ALTER TABLE partner_applications RENAME COLUMN user_id TO partner_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vendor_applications'
      AND column_name = 'user_id'
  ) THEN
    INSERT INTO vendors (id, email, display_name, given_name, google_sub, phone, password_hash, created_at)
    SELECT u.id, u.email, u.display_name, u.given_name, u.google_sub, u.phone, u.password_hash, u.created_at
    FROM users u
    WHERE u.id IN (SELECT user_id FROM vendor_applications)
    ON CONFLICT (id) DO NOTHING;
    ALTER TABLE vendor_applications DROP CONSTRAINT IF EXISTS vendor_applications_user_id_fkey;
    ALTER TABLE vendor_applications RENAME COLUMN user_id TO vendor_id;
  END IF;
END $$;

INSERT INTO vendors (id, email, display_name, given_name, google_sub, phone, password_hash, created_at)
SELECT u.id, u.email, u.display_name, u.given_name, u.google_sub, u.phone, u.password_hash, u.created_at
FROM users u
WHERE u.id IN (SELECT owner_id FROM products WHERE owner_id IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE partner_applications DROP CONSTRAINT IF EXISTS partner_applications_partner_id_fkey;
ALTER TABLE partner_applications
  ADD CONSTRAINT partner_applications_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES partners (id);

ALTER TABLE vendor_applications DROP CONSTRAINT IF EXISTS vendor_applications_vendor_id_fkey;
ALTER TABLE vendor_applications
  ADD CONSTRAINT vendor_applications_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors (id);

UPDATE products SET owner_id = NULL
WHERE owner_id IS NOT NULL AND owner_id NOT IN (SELECT id FROM vendors);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_owner_id_fkey;
ALTER TABLE products
  ADD CONSTRAINT products_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES vendors (id);

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE service_bookings DROP CONSTRAINT IF EXISTS service_bookings_user_id_fkey;

DELETE FROM users WHERE role IN ('partner', 'vendor');

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS account_kind VARCHAR(16);
UPDATE sessions SET account_kind = 'user' WHERE account_kind IS NULL;
UPDATE sessions s SET account_kind = 'partner'
FROM partners p
WHERE s.user_id = p.id
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);
UPDATE sessions s SET account_kind = 'vendor'
FROM vendors v
WHERE s.user_id = v.id
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);
UPDATE sessions SET account_kind = 'user' WHERE account_kind IS NULL;
ALTER TABLE sessions ALTER COLUMN account_kind SET DEFAULT 'user';
ALTER TABLE sessions ALTER COLUMN account_kind SET NOT NULL;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_account_kind_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_account_kind_check
  CHECK (account_kind IN ('user', 'partner', 'vendor'));
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions (account_kind, user_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_kind VARCHAR(16);
UPDATE orders SET account_kind = 'user' WHERE account_kind IS NULL;
UPDATE orders o SET account_kind = 'partner'
FROM partners p
WHERE o.user_id = p.id
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o.user_id);
UPDATE orders o SET account_kind = 'vendor'
FROM vendors v
WHERE o.user_id = v.id
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = o.user_id);
UPDATE orders SET account_kind = 'user' WHERE account_kind IS NULL;
ALTER TABLE orders ALTER COLUMN account_kind SET DEFAULT 'user';
ALTER TABLE orders ALTER COLUMN account_kind SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_account_kind_check;
ALTER TABLE orders ADD CONSTRAINT orders_account_kind_check
  CHECK (account_kind IN ('user', 'partner', 'vendor'));
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders (account_kind, user_id);

ALTER TABLE service_bookings ADD COLUMN IF NOT EXISTS account_kind VARCHAR(16);
UPDATE service_bookings SET account_kind = 'user' WHERE account_kind IS NULL;
UPDATE service_bookings b SET account_kind = 'partner'
FROM partners p
WHERE b.user_id = p.id
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id);
UPDATE service_bookings b SET account_kind = 'vendor'
FROM vendors v
WHERE b.user_id = v.id
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id);
UPDATE service_bookings SET account_kind = 'user' WHERE account_kind IS NULL;
ALTER TABLE service_bookings ALTER COLUMN account_kind SET DEFAULT 'user';
ALTER TABLE service_bookings ALTER COLUMN account_kind SET NOT NULL;
ALTER TABLE service_bookings DROP CONSTRAINT IF EXISTS service_bookings_account_kind_check;
ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_account_kind_check
  CHECK (account_kind IN ('user', 'partner', 'vendor'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'staff'));
