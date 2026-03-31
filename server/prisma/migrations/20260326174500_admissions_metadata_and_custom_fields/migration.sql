ALTER TABLE "enquiries"
ADD COLUMN "academic_year" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "priority" TEXT,
ADD COLUMN "custom_fields" JSONB;

ALTER TABLE "applications"
ADD COLUMN "custom_fields" JSONB;
