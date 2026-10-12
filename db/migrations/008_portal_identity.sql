-- Same email and Google subject may exist once per portal role.
-- The account id is the identity; guest (customer) and admin (staff) are separate rows.
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email;
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_google_sub;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_role ON users (email, role);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub_role ON users (google_sub, role);
