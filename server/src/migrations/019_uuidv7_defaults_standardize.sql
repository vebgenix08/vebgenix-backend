-- 019_uuidv7_defaults_standardize.sql
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.tenants   ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE public.campuses  ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE public.enquiries     ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE public.applications  ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE public.students      ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE public.application_documents ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE public.application_reviews   ALTER COLUMN id SET DEFAULT uuid_generate_v7();

ALTER TABLE public.audit_logs    ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE public.employees     ALTER COLUMN id SET DEFAULT uuid_generate_v7();
ALTER TABLE public.user_campus_access ALTER COLUMN id SET DEFAULT uuid_generate_v7();

COMMIT;
