-- Migration: 20260417140000_attendance
-- Creates the AttendanceStatus enum and attendance table

-- New enum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- Attendance table
CREATE TABLE "attendance" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID        NOT NULL,
  "student_id"  UUID        NOT NULL,
  "section_id"  UUID        NOT NULL,
  "campus_id"   UUID        NOT NULL,
  "date"        DATE        NOT NULL,
  "status"      "AttendanceStatus" NOT NULL,
  "remarks"     TEXT,
  "marked_by"   UUID,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_student_section_date_key" UNIQUE ("student_id", "section_id", "date"),
  CONSTRAINT "attendance_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id")  ON DELETE CASCADE,
  CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE,
  CONSTRAINT "attendance_campus_id_fkey"  FOREIGN KEY ("campus_id")  REFERENCES "campuses"("id") ON DELETE CASCADE
);

CREATE INDEX "attendance_tenant_idx"      ON "attendance"("tenant_id");
CREATE INDEX "attendance_section_date_idx" ON "attendance"("section_id", "date");
CREATE INDEX "attendance_student_idx"      ON "attendance"("student_id");

-- RLS
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS tenant_isolation ON "attendance";
  CREATE POLICY tenant_isolation ON "attendance"
    AS RESTRICTIVE FOR ALL TO app_user
    USING (tenant_id::text = current_setting('app.tenant_id', true)::text);
END $$;
