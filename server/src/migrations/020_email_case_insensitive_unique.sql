-- Migration 020: Enforce case-insensitive uniqueness on auth_users.email
--
-- PostgreSQL's built-in UNIQUE constraint is case-sensitive.
-- We already normalize to lowercase in the service layer, but this index
-- ensures uniqueness is enforced at the DB level regardless of how data
-- enters the table (e.g., direct SQL, future scripts, etc.)
--
-- Note: If there are existing rows with mixed-case duplicates, resolve them
-- first before applying this migration.

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_lower_unique
  ON "AuthUser" (LOWER(email));

-- Comment: This index is a safety net. The primary enforcement is:
-- 1. Service layer: email.trim().toLowerCase() before all reads/writes
-- 2. Prisma schema: email @unique (case-sensitive baseline)
-- 3. This index: case-insensitive enforcement at DB level
