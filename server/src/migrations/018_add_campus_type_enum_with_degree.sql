-- 018_add_campus_type_enum_with_degree.sql
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampusType') THEN
    CREATE TYPE "CampusType" AS ENUM ('SCHOOL', 'PU', 'DEGREE');
  END IF;
END $$;

ALTER TABLE public.campuses
  DROP CONSTRAINT IF EXISTS campuses_campus_type_check;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_campus_type_check;

-- Convert campuses.campus_type -> CampusType
ALTER TABLE public.campuses
  ALTER COLUMN campus_type TYPE "CampusType"
  USING CASE UPPER(campus_type::text)
    WHEN 'SCHOOL' THEN 'SCHOOL'::"CampusType"
    WHEN 'PU' THEN 'PU'::"CampusType"
    WHEN 'DEGREE' THEN 'DEGREE'::"CampusType"
    ELSE 'SCHOOL'::"CampusType"
  END;

-- Convert students.campus_type -> CampusType
ALTER TABLE public.students
  ALTER COLUMN campus_type TYPE "CampusType"
  USING CASE UPPER(campus_type::text)
    WHEN 'SCHOOL' THEN 'SCHOOL'::"CampusType"
    WHEN 'PU' THEN 'PU'::"CampusType"
    WHEN 'DEGREE' THEN 'DEGREE'::"CampusType"
    ELSE 'SCHOOL'::"CampusType"
  END;

COMMIT;
