-- 013_fix_wrong_constraints_and_prepare_scope.sql
BEGIN;

-- 1) Remove WRONG uniques from migration 005 (safe)
ALTER TABLE IF EXISTS public.applications
  DROP CONSTRAINT IF EXISTS applications_tenant_application_id_unique;

ALTER TABLE IF EXISTS public.enquiries
  DROP CONSTRAINT IF EXISTS enquiries_tenant_enquiry_id_unique;

-- 2) Ensure tenant_id + campus_id columns exist (idempotent)
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS campus_id uuid;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS campus_id uuid;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS campus_id uuid;

-- 3) Add scoped indexes (performance + correctness)
CREATE INDEX IF NOT EXISTS idx_enquiries_tenant_campus_created
  ON public.enquiries(tenant_id, campus_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_tenant_campus_status
  ON public.applications(tenant_id, campus_id, status);

CREATE INDEX IF NOT EXISTS idx_students_tenant_campus_status
  ON public.students(tenant_id, campus_id, status);

CREATE INDEX IF NOT EXISTS idx_students_tenant_campus_enrollment
  ON public.students(tenant_id, campus_id, enrollment_date DESC);

COMMIT;
