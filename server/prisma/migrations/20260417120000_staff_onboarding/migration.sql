-- ============================================================
-- Migration: staff_onboarding
-- Extends Employee table with full staff profile fields.
-- Adds StaffReporting table for campus-specific reporting hierarchy.
-- Extends StaffType enum with additional role values.
-- Adds EmploymentType, StaffCategory, ReportingStatus enums.
-- ============================================================

-- New enums
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING');
CREATE TYPE "StaffCategory" AS ENUM ('TEACHING', 'NON_TEACHING');
CREATE TYPE "ReportingStatus" AS ENUM ('ASSIGNED', 'PENDING', 'ORPHANED');

-- Extend StaffType enum (ADD VALUE is safe — cannot remove values in Postgres)
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'VICE_PRINCIPAL';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'DEAN';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'LECTURER';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'LAB_FACULTY';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'LIBRARIAN';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'RECEPTIONIST';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'OFFICE_ADMIN';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'LAB_ASSISTANT';
ALTER TYPE "StaffType" ADD VALUE IF NOT EXISTS 'HR_SUPPORT';

-- Extend employees table (all columns optional — no data loss on existing rows)
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "gender"               "Gender",
  ADD COLUMN IF NOT EXISTS "date_of_birth"        DATE,
  ADD COLUMN IF NOT EXISTS "qualification"        TEXT,
  ADD COLUMN IF NOT EXISTS "experience_years"     INTEGER,
  ADD COLUMN IF NOT EXISTS "employment_type"      "EmploymentType",
  ADD COLUMN IF NOT EXISTS "staff_category"       "StaffCategory",
  ADD COLUMN IF NOT EXISTS "is_head"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_acting_head"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "head_effective_from"  DATE;

-- New staff_reporting table
CREATE TABLE IF NOT EXISTS "staff_reporting" (
  "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             UUID        NOT NULL,
  "profile_id"            UUID        NOT NULL,
  "reports_to_profile_id" UUID,
  "campus_id"             UUID        NOT NULL,
  "reporting_status"      "ReportingStatus" NOT NULL DEFAULT 'PENDING',
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "staff_reporting_pkey"                   PRIMARY KEY ("id"),
  CONSTRAINT "staff_reporting_profile_campus_unique"  UNIQUE      ("profile_id", "campus_id"),
  CONSTRAINT "staff_reporting_profile_id_fkey"        FOREIGN KEY ("profile_id")            REFERENCES "profiles"("id")  ON DELETE CASCADE,
  CONSTRAINT "staff_reporting_reports_to_fkey"        FOREIGN KEY ("reports_to_profile_id") REFERENCES "profiles"("id")  ON DELETE SET NULL,
  CONSTRAINT "staff_reporting_campus_id_fkey"         FOREIGN KEY ("campus_id")             REFERENCES "campuses"("id")  ON DELETE CASCADE,
  CONSTRAINT "staff_reporting_tenant_id_fkey"         FOREIGN KEY ("tenant_id")             REFERENCES "tenants"("id")   ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "staff_reporting_tenant_idx"  ON "staff_reporting"("tenant_id");
CREATE INDEX IF NOT EXISTS "staff_reporting_manager_idx" ON "staff_reporting"("reports_to_profile_id");

-- RLS on staff_reporting
ALTER TABLE "staff_reporting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_reporting" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON staff_reporting;
  CREATE POLICY tenant_isolation ON staff_reporting
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;
