-- CreateEnum
CREATE TYPE "PublishedResultFileType" AS ENUM ('PDF', 'EXCEL');

-- CreateTable
CREATE TABLE "published_result_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campus_id" UUID NOT NULL,
    "academic_year" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "section_name" TEXT NOT NULL,
    "exam_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "file_type" "PublishedResultFileType" NOT NULL,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "public_token" TEXT NOT NULL,
    "uploaded_by_profile_id" UUID,
    "published_at" TIMESTAMPTZ,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "published_result_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "published_result_batches_public_token_key" ON "published_result_batches"("public_token");

-- CreateIndex
CREATE INDEX "published_result_batches_tenant_id_campus_id_academic_year_idx" ON "published_result_batches"("tenant_id", "campus_id", "academic_year");

-- CreateIndex
CREATE INDEX "published_result_batches_tenant_id_campus_id_class_name_sec_idx" ON "published_result_batches"("tenant_id", "campus_id", "class_name", "section_name", "exam_name");

-- AddForeignKey
ALTER TABLE "published_result_batches" ADD CONSTRAINT "published_result_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_result_batches" ADD CONSTRAINT "published_result_batches_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "campuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_result_batches" ADD CONSTRAINT "published_result_batches_uploaded_by_profile_id_fkey" FOREIGN KEY ("uploaded_by_profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
