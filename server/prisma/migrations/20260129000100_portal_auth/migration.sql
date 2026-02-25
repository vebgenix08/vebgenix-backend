-- Portal auth updates: enums, profiles, students

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'UserRole'
        AND e.enumlabel NOT IN ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT')
    ) THEN
      CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT');
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
      ) THEN
        UPDATE public.profiles
        SET role = 'STAFF'
        WHERE role IS NOT NULL
          AND role NOT IN ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT');
        ALTER TABLE public.profiles
          ALTER COLUMN role TYPE "UserRole_new" USING role::text::"UserRole_new";
      END IF;
      DROP TYPE "UserRole";
      ALTER TYPE "UserRole_new" RENAME TO "UserRole";
    END IF;
  ELSE
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampusScope') THEN
    IF EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'CampusScope'
        AND e.enumlabel = 'ALL'
    ) THEN
      CREATE TYPE "CampusScope_new" AS ENUM ('SCHOOL', 'PU');

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles'
      ) THEN
        UPDATE public.profiles
        SET campus_scope = NULL
        WHERE campus_scope = 'ALL';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'enquiries'
      ) THEN
        UPDATE public.enquiries
        SET campus_scope = 'SCHOOL'
        WHERE campus_scope = 'ALL';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'applications'
      ) THEN
        UPDATE public.applications
        SET campus_scope = 'SCHOOL'
        WHERE campus_scope = 'ALL';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'students'
      ) THEN
        UPDATE public.students
        SET campus_type = 'SCHOOL'
        WHERE campus_type = 'ALL';
      END IF;

      ALTER TABLE IF EXISTS public.profiles
        ALTER COLUMN campus_scope TYPE "CampusScope_new" USING NULLIF(campus_scope, '')::"CampusScope_new";
      ALTER TABLE IF EXISTS public.enquiries
        ALTER COLUMN campus_scope TYPE "CampusScope_new" USING campus_scope::text::"CampusScope_new";
      ALTER TABLE IF EXISTS public.applications
        ALTER COLUMN campus_scope TYPE "CampusScope_new" USING campus_scope::text::"CampusScope_new";
      ALTER TABLE IF EXISTS public.students
        ALTER COLUMN campus_type TYPE "CampusScope_new" USING campus_type::text::"CampusScope_new";

      DROP TYPE "CampusScope";
      ALTER TYPE "CampusScope_new" RENAME TO "CampusScope";
    END IF;
  ELSE
    CREATE TYPE "CampusScope" AS ENUM ('SCHOOL', 'PU');
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
  ALTER COLUMN role TYPE "UserRole" USING role::text::"UserRole",
  ALTER COLUMN campus_scope TYPE "CampusScope" USING NULLIF(campus_scope, '')::"CampusScope";

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

ALTER TABLE IF EXISTS public.students
  ALTER COLUMN campus_type TYPE "CampusScope" USING campus_type::text::"CampusScope";

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_reg_no_unique ON public.students(reg_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_portal_auth_user_id_unique ON public.students(portal_auth_user_id);
