-- Migration: add_personas_permissions
-- Adds PersonaRole, StaffType enums; persona_role + staff_type to profiles;
-- Creates permissions and profile_permissions tables.

-- 1. Create PersonaRole enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PersonaRole') THEN
    CREATE TYPE "PersonaRole" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'STAFF', 'STUDENT', 'PARENT');
  END IF;
END $$;

-- 2. Create StaffType enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StaffType') THEN
    CREATE TYPE "StaffType" AS ENUM ('PRINCIPAL', 'HOD', 'TEACHER', 'ACCOUNTANT', 'CLERK', 'OTHER');
  END IF;
END $$;

-- 3. Add persona_role and staff_type columns to profiles (nullable)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS persona_role "PersonaRole",
  ADD COLUMN IF NOT EXISTS staff_type   "StaffType";

-- 4. Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  key        TEXT UNIQUE NOT NULL,
  label      TEXT NOT NULL,
  module     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Create profile_permissions table
CREATE TABLE IF NOT EXISTS public.profile_permissions (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission_id        TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  campus_id            UUID,
  granted_by_profile_id UUID,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 6. Add indexes on profile_permissions
CREATE INDEX IF NOT EXISTS idx_pp_tenant_profile
  ON public.profile_permissions(tenant_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_pp_tenant_profile_campus
  ON public.profile_permissions(tenant_id, profile_id, campus_id);

CREATE INDEX IF NOT EXISTS idx_pp_tenant_campus
  ON public.profile_permissions(tenant_id, campus_id);

-- 7. Unique constraint: (tenantId, profileId, permissionId, campusId)
-- We handle NULL campusId as a distinct value (tenant-wide grant) at the app level.
-- Use a partial unique index approach for nullable campusId:
CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_unique_tenant_wide
  ON public.profile_permissions(tenant_id, profile_id, permission_id)
  WHERE campus_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_unique_campus_scoped
  ON public.profile_permissions(tenant_id, profile_id, permission_id, campus_id)
  WHERE campus_id IS NOT NULL;
