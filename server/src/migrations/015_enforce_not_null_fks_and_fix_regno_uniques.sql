-- 015_enforce_not_null_fks_and_fix_regno_uniques.sql
BEGIN;

-- 1) Enforce NOT NULL
ALTER TABLE public.enquiries
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN campus_id SET NOT NULL;

ALTER TABLE public.applications
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN campus_id SET NOT NULL;

ALTER TABLE public.students
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN campus_id SET NOT NULL;

-- 2) Add FKs if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enquiries_tenant') THEN
    ALTER TABLE public.enquiries
      ADD CONSTRAINT fk_enquiries_tenant
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_enquiries_campus') THEN
    ALTER TABLE public.enquiries
      ADD CONSTRAINT fk_enquiries_campus
      FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_tenant') THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT fk_applications_tenant
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_applications_campus') THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT fk_applications_campus
      FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_tenant') THEN
    ALTER TABLE public.students
      ADD CONSTRAINT fk_students_tenant
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_students_campus') THEN
    ALTER TABLE public.students
      ADD CONSTRAINT fk_students_campus
      FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3) Remove GLOBAL unique reg_no (constraint + prisma-created index)
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_reg_no_key;

DROP INDEX IF EXISTS public.idx_students_reg_no_unique;

-- 4) Add scoped unique reg_no
ALTER TABLE public.students
  ADD CONSTRAINT students_tenant_campus_reg_no_uniq UNIQUE (tenant_id, campus_id, reg_no);

-- 5) admission_number: remove global unique and add partial scoped unique
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_admission_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS students_tenant_campus_admission_number_uniq
  ON public.students(tenant_id, campus_id, admission_number)
  WHERE admission_number IS NOT NULL;

COMMIT;
