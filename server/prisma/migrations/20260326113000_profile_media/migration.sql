ALTER TABLE "profiles"
ADD COLUMN "avatar_url" TEXT,
ADD COLUMN "avatar_key" TEXT;

ALTER TABLE "tenants"
ADD COLUMN "logo_url" TEXT,
ADD COLUMN "logo_key" TEXT;
