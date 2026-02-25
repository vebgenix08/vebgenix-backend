"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = __importDefault(require("../prisma/client"));
async function main() {
    console.log('🔧 Applying Manual Schema Constraints & Enums...');
    try {
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'STAFF', 'TEACHER', 'STUDENT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "CampusScope" AS ENUM ('SCHOOL', 'PU');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'APPROVED', 'REJECTED', 'MIGRATED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "Gender" AS ENUM ('Male', 'Female', 'Other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "DocumentType" AS ENUM ('AADHAR', 'MARKS_CARD', 'TC');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ReviewDecision" AS ENUM ('RECOMMEND', 'NOT_RECOMMEND', 'HOLD');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        await client_1.default.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'ALUMNI', 'WITHDRAWN', 'SUSPENDED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
        console.log('✅ Enums Created.');
        await client_1.default.$executeRawUnsafe(`DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.profiles ALTER COLUMN role TYPE "UserRole" USING role::"UserRole"`);
        await client_1.default.$executeRawUnsafe(`
      CREATE POLICY "Admins can view all profiles" ON public.profiles
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN'::"UserRole")
      );
    `);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.profiles ALTER COLUMN campus_scope DROP DEFAULT`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_campus_scope_check`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.profiles ALTER COLUMN campus_scope TYPE "CampusScope" USING campus_scope::"CampusScope"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.enquiries ALTER COLUMN status DROP DEFAULT`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.enquiries ALTER COLUMN status TYPE "EnquiryStatus" USING status::"EnquiryStatus"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.enquiries ALTER COLUMN status SET DEFAULT 'NEW'::"EnquiryStatus"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_campus_scope_check`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.enquiries ALTER COLUMN campus_scope TYPE "CampusScope" USING campus_scope::"CampusScope"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.applications ALTER COLUMN status DROP DEFAULT`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_status_check`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.applications ALTER COLUMN status TYPE "ApplicationStatus" USING status::"ApplicationStatus"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.applications ALTER COLUMN status SET DEFAULT 'DRAFT'::"ApplicationStatus"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.students ALTER COLUMN status DROP DEFAULT`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_status_check`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.students ALTER COLUMN status TYPE "StudentStatus" USING status::"StudentStatus"`);
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.students ALTER COLUMN status SET DEFAULT 'ACTIVE'::"StudentStatus"`);
        console.log('✅ Tables Altered to use Enums.');
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.students ADD CONSTRAINT students_reg_no_key UNIQUE (reg_no)`).catch(() => console.log('Constraint students_reg_no_key already exists'));
        await client_1.default.$executeRawUnsafe(`ALTER TABLE public.students ADD CONSTRAINT students_application_id_key UNIQUE (application_id)`).catch(() => console.log('Constraint students_application_id_key already exists'));
        console.log('✅ Unique Constraints Applied.');
    }
    catch (e) {
        console.error('❌ Schema Apply Failed:', e);
    }
    finally {
        await client_1.default.$disconnect();
    }
}
main();
//# sourceMappingURL=apply_manual_schema.js.map