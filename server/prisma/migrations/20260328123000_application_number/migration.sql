ALTER TABLE "applications"
ADD COLUMN "application_number" TEXT;

UPDATE "applications"
SET "application_number" = 'APP-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 10))
WHERE "application_number" IS NULL;

CREATE UNIQUE INDEX "applications_tenant_id_campus_id_application_number_key"
ON "applications"("tenant_id", "campus_id", "application_number");
