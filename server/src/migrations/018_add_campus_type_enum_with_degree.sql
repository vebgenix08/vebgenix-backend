-- 018_add_campus_type_enum_with_degree.sql
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampusType') THEN
    CREATE TYPE "CampusType" AS ENUM ('SCHOOL', 'PU', 'DEGREE');
  END IF;
END $$;

-- Convert campuses.campus_type -> CampusType
ALTER TABLE public.campuses
  ALTER COLUMN campus_type TYPE "CampusType"
  USING campus_type::text::"CampusType";

-- Convert students.campus_type -> CampusType
ALTER TABLE public.students
  ALTER COLUMN campus_type TYPE "CampusType"
  USING campus_type::text::"CampusType";

COMMIT;
