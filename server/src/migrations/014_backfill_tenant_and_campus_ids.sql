-- 014_backfill_tenant_and_campus_ids.sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure there is at least one tenant
DO $$
DECLARE
  t uuid;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  IF t IS NULL THEN
    INSERT INTO public.tenants (id, name, subdomain, is_active, created_at, updated_at)
    VALUES (uuid_generate_v7(), 'Default Tenant', 'default', true, now(), now());
  END IF;
END $$;

-- Ensure there is at least one campus for that tenant
DO $$
DECLARE
  t uuid;
  c uuid;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO c FROM public.campuses WHERE tenant_id = t ORDER BY created_at ASC LIMIT 1;

  IF c IS NULL THEN
    INSERT INTO public.campuses (id, tenant_id, name, campus_type, is_active, created_at, updated_at)
    VALUES (uuid_generate_v7(), t, 'Default Campus', 'SCHOOL', true, now(), now());
  END IF;
END $$;

-- Backfill operational tables
DO $$
DECLARE
  t uuid;
  c uuid;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO c FROM public.campuses WHERE tenant_id = t ORDER BY created_at ASC LIMIT 1;

  UPDATE public.enquiries
    SET tenant_id = COALESCE(tenant_id, t),
        campus_id = COALESCE(campus_id, c)
  WHERE tenant_id IS NULL OR campus_id IS NULL;

  UPDATE public.applications
    SET tenant_id = COALESCE(tenant_id, t),
        campus_id = COALESCE(campus_id, c)
  WHERE tenant_id IS NULL OR campus_id IS NULL;

  UPDATE public.students
    SET tenant_id = COALESCE(tenant_id, t),
        campus_id = COALESCE(campus_id, c)
  WHERE tenant_id IS NULL OR campus_id IS NULL;

  UPDATE public.profiles
    SET tenant_id = COALESCE(tenant_id, t)
  WHERE tenant_id IS NULL;
END $$;

COMMIT;
