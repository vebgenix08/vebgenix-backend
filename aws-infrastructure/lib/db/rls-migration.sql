-- ============================================================
-- Vebgenix RLS Migration
-- Enables Row Level Security on all core tenant-owned tables.
--
-- IMPORTANT:
--   1. Run this ONCE after first migration (prisma migrate deploy)
--   2. These are idempotent — safe to re-run
--   3. app_user is the Prisma DB role (NOT superuser)
--   4. SUPER_ADMIN Lambda uses a separate admin_user role
--      that has BYPASSRLS to do cross-tenant queries
-- ============================================================

-- ── Create non-superuser app role for Prisma ─────────────────
-- (Skip if already created by initial migration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'REPLACE_WITH_SECRET_FROM_SECRETS_MANAGER';
  END IF;
END $$;

GRANT CONNECT ON DATABASE vebgenix TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- ── Admin role (bypasses RLS for SUPER_ADMIN Lambda) ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'admin_user') THEN
    CREATE ROLE admin_user LOGIN PASSWORD 'REPLACE_WITH_SECRET_FROM_SECRETS_MANAGER';
  END IF;
END $$;

GRANT CONNECT ON DATABASE vebgenix TO admin_user;
GRANT USAGE ON SCHEMA public TO admin_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO admin_user;
ALTER ROLE admin_user BYPASSRLS;  -- Cross-tenant queries for SUPER_ADMIN

-- ============================================================
-- Enable RLS on core tables
-- ============================================================

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              FORCE ROW LEVEL SECURITY;

ALTER TABLE applications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications          FORCE ROW LEVEL SECURITY;

ALTER TABLE enquiries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries             FORCE ROW LEVEL SECURITY;

ALTER TABLE students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE students              FORCE ROW LEVEL SECURITY;

ALTER TABLE employees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees             FORCE ROW LEVEL SECURITY;

ALTER TABLE campuses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses              FORCE ROW LEVEL SECURITY;

ALTER TABLE user_campus_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_campus_access    FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            FORCE ROW LEVEL SECURITY;

ALTER TABLE profile_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_permissions   FORCE ROW LEVEL SECURITY;

ALTER TABLE tenant_features       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_features       FORCE ROW LEVEL SECURITY;

-- application_documents and application_reviews inherit scope via FK to applications
-- but add RLS via JOIN-based policy for defence in depth:
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents FORCE ROW LEVEL SECURITY;

ALTER TABLE application_reviews   ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_reviews   FORCE ROW LEVEL SECURITY;

-- tenants: no RLS — read-only lookup allowed; mutations guarded in Lambda
-- platform_users / platform_audit_logs: no tenant_id, no RLS

-- ============================================================
-- RLS Policies — tenant_isolation (RESTRICTIVE)
-- Each USING clause checks the session variable set by withTenant()
-- ============================================================

-- Helper: drop policy if exists then recreate (idempotent)
DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON profiles;
  CREATE POLICY tenant_isolation ON profiles
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON applications;
  CREATE POLICY tenant_isolation ON applications
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON enquiries;
  CREATE POLICY tenant_isolation ON enquiries
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON students;
  CREATE POLICY tenant_isolation ON students
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON employees;
  CREATE POLICY tenant_isolation ON employees
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON campuses;
  CREATE POLICY tenant_isolation ON campuses
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON user_campus_access;
  CREATE POLICY tenant_isolation ON user_campus_access
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
  CREATE POLICY tenant_isolation ON audit_logs
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON profile_permissions;
  CREATE POLICY tenant_isolation ON profile_permissions
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON tenant_features;
  CREATE POLICY tenant_isolation ON tenant_features
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;

-- application_documents: scoped via parent application
DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON application_documents;
  CREATE POLICY tenant_isolation ON application_documents
    AS RESTRICTIVE FOR ALL TO app_user
    USING (
      EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_documents.application_id
          AND a.tenant_id::text = current_setting('app.tenant_id', true)::text
      )
    );
END $$;

-- application_reviews: scoped via parent application
DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON application_reviews;
  CREATE POLICY tenant_isolation ON application_reviews
    AS RESTRICTIVE FOR ALL TO app_user
    USING (
      EXISTS (
        SELECT 1 FROM applications a
        WHERE a.id = application_reviews.application_id
          AND a.tenant_id::text = current_setting('app.tenant_id', true)::text
      )
    );
END $$;

-- ============================================================
-- Verify
-- ============================================================
SELECT tablename, rowsecurity, forceroulsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','applications','enquiries','students',
    'employees','campuses','user_campus_access',
    'audit_logs','profile_permissions','tenant_features',
    'application_documents','application_reviews'
  )
ORDER BY tablename;
