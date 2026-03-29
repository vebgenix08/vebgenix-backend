-- Portal auth updates: enums, profiles, students

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'PARENT'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'PARENT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampusScope') THEN
    CREATE TYPE "CampusScope" AS ENUM ('SCHOOL', 'PU', 'ALL');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'CampusScope' AND e.enumlabel = 'ALL'
  ) THEN
    ALTER TYPE "CampusScope" ADD VALUE 'ALL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role "UserRole" NOT NULL,
  campus_scope "CampusScope",
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.profiles
  ALTER COLUMN role TYPE "UserRole" USING CASE UPPER(role::text)
    WHEN 'ADMIN' THEN 'ADMIN'::"UserRole"
    WHEN 'ACCOUNTANT' THEN 'ACCOUNTANT'::"UserRole"
    WHEN 'STAFF' THEN 'STAFF'::"UserRole"
    WHEN 'TEACHER' THEN 'TEACHER'::"UserRole"
    WHEN 'STUDENT' THEN 'STUDENT'::"UserRole"
    WHEN 'PARENT' THEN 'PARENT'::"UserRole"
    ELSE 'STAFF'::"UserRole"
  END,
  ALTER COLUMN campus_scope TYPE "CampusScope" USING CASE UPPER(NULLIF(campus_scope::text, ''))
    WHEN 'SCHOOL' THEN 'SCHOOL'::"CampusScope"
    WHEN 'PU' THEN 'PU'::"CampusScope"
    WHEN 'ALL' THEN 'ALL'::"CampusScope"
    ELSE NULL
  END;

ALTER TABLE IF EXISTS public.profiles
  ALTER COLUMN campus_scope DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'registration_number'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN registration_number TO reg_no;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'campus_scope'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN campus_scope TO campus_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'email'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN email TO student_email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN phone TO parent_phone;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN user_id TO portal_auth_user_id;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS parent_email TEXT;

ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS parent_phone TEXT;

ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS portal_auth_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_reg_no_unique ON public.students(reg_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_portal_auth_user_id_unique ON public.students(portal_auth_user_id);
