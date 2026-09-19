-- Postgres schema (Neon locally via Compose, hosted via Neon).
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NULL,
  given_name VARCHAR(40) NULL,
  google_sub VARCHAR(255) NULL,
  phone VARCHAR(16) NULL,
  password_hash VARCHAR(255) NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_phone UNIQUE (phone),
  CONSTRAINT uq_users_google_sub UNIQUE (google_sub)
);

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

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) NOT NULL PRIMARY KEY,
  account_kind VARCHAR(16) NOT NULL DEFAULT 'user'
    CHECK (account_kind IN ('user', 'partner', 'vendor')),
  user_id CHAR(36) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions (account_kind, user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  presenter VARCHAR(200) NOT NULL,
  venue VARCHAR(200) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  attendee_target INT NOT NULL DEFAULT 200,
  flash_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  flash_ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  price_ksh INT NOT NULL,
  seats_per_unit INT NOT NULL DEFAULT 1,
  capacity INT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_ticket_types_event_code UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS sale_windows (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  ticket_code VARCHAR(32) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_windows_event_code ON sale_windows (event_id, ticket_code);

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_kind VARCHAR(16) NOT NULL DEFAULT 'user'
    CHECK (account_kind IN ('user', 'partner', 'vendor')),
  user_id CHAR(36) NOT NULL,
  event_id CHAR(36) NULL REFERENCES events (id),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('tickets', 'vendor', 'service', 'product')),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  total_ksh INT NOT NULL,
  hold_expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ NULL,
  stub_downloaded_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_account ON orders (account_kind, user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

CREATE TABLE IF NOT EXISTS order_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id CHAR(36) NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  sku_kind VARCHAR(32) NOT NULL,
  sku_code VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  qty INT NOT NULL,
  unit_price_ksh INT NOT NULL,
  seats INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items (sku_kind, sku_code);

CREATE TABLE IF NOT EXISTS tickets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id CHAR(36) NOT NULL REFERENCES orders (id),
  event_id CHAR(36) NOT NULL REFERENCES events (id),
  ticket_code VARCHAR(32) NOT NULL,
  public_id CHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'used', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ NULL,
  CONSTRAINT uq_tickets_public_id UNIQUE (public_id)
);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets (event_id, status);

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id CHAR(36) NOT NULL REFERENCES orders (id),
  provider VARCHAR(32) NOT NULL DEFAULT 'mpesa',
  checkout_request_id VARCHAR(64) NULL,
  merchant_request_id VARCHAR(64) NULL,
  receipt VARCHAR(64) NULL,
  result_code VARCHAR(16) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payments_checkout UNIQUE (checkout_request_id)
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);

CREATE TABLE IF NOT EXISTS partner_applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  partner_id CHAR(36) NOT NULL REFERENCES partners (id),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('partner', 'sponsor')),
  member_count INT NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(200) NOT NULL,
  website VARCHAR(400) NULL,
  brand_info VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_status ON partner_applications (status);

CREATE TABLE IF NOT EXISTS vendor_packages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL REFERENCES events (id),
  code VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category_hint VARCHAR(80) NOT NULL,
  space_description VARCHAR(500) NOT NULL,
  fee_ksh INT NOT NULL,
  setup_time VARCHAR(120) NOT NULL,
  operating_hours VARCHAR(120) NOT NULL,
  payment_deadline TIMESTAMPTZ NOT NULL,
  rules TEXT NOT NULL,
  CONSTRAINT uq_vendor_pkg_code UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS vendor_applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  vendor_id CHAR(36) NOT NULL REFERENCES vendors (id),
  package_id CHAR(36) NOT NULL REFERENCES vendor_packages (id),
  category VARCHAR(80) NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  notes VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_payment', 'paid', 'rejected')),
  order_id CHAR(36) NULL REFERENCES orders (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_offerings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  price_ksh INT NOT NULL,
  CONSTRAINT uq_service_slug UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS service_bookings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  account_kind VARCHAR(16) NOT NULL DEFAULT 'user'
    CHECK (account_kind IN ('user', 'partner', 'vendor')),
  user_id CHAR(36) NOT NULL,
  offering_id CHAR(36) NOT NULL REFERENCES service_offerings (id),
  event_date DATE NOT NULL,
  pax INT NOT NULL,
  notes VARCHAR(2000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  order_id CHAR(36) NULL REFERENCES orders (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  price_ksh INT NOT NULL,
  stock INT NOT NULL,
  owner_id CHAR(36) NULL REFERENCES vendors (id),
  CONSTRAINT uq_product_slug UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_products_owner ON products (owner_id);
