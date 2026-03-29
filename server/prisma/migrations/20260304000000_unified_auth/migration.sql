-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ResetTokenPurpose" AS ENUM ('INVITE_SET_PASSWORD', 'FORGOT_PASSWORD');

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_auth_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_campus_access" DROP CONSTRAINT IF EXISTS "user_campus_access_user_id_fkey";

-- Drop legacy uniqueness on employees.auth_user_id
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_auth_user_id_key";
DROP INDEX IF EXISTS "employees_auth_user_id_key";

ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_subdomain_key";
DROP INDEX IF EXISTS "tenants_subdomain_key";

ALTER TABLE "user_campus_access" DROP CONSTRAINT IF EXISTS "user_campus_access_user_id_campus_id_key";
DROP INDEX IF EXISTS "user_campus_access_user_id_campus_id_key";

-- DropIndex
DROP INDEX IF EXISTS "user_campus_access_user_id_idx";

-- AlterTable
ALTER TABLE "PasswordResetToken"
DROP COLUMN IF EXISTS "createdAt",
DROP COLUMN IF EXISTS "expiresAt",
DROP COLUMN IF EXISTS "tokenHash",
DROP COLUMN IF EXISTS "usedAt",
ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "membership_id" UUID,
ADD COLUMN IF NOT EXISTS "purpose" "ResetTokenPurpose",
ADD COLUMN IF NOT EXISTS "tenant_id" UUID,
ADD COLUMN IF NOT EXISTS "token_hash" TEXT,
ADD COLUMN IF NOT EXISTS "used_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "TenantMembership"
ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "disabled_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "invited_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "invited_by_user_id" UUID,
ADD COLUMN IF NOT EXISTS "is_primary_admin" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN IF EXISTS "status",
ADD COLUMN IF NOT EXISTS "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "employees"
DROP COLUMN IF EXISTS "auth_user_id",
ADD COLUMN IF NOT EXISTS "profile_id" UUID;

-- AlterTable
ALTER TABLE "profiles"
DROP COLUMN IF EXISTS "password_hash",
DROP COLUMN IF EXISTS "reset_token",
DROP COLUMN IF EXISTS "reset_token_expiry",
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "auth_user_id" UUID;

-- AlterTable
ALTER TABLE "tenants"
DROP COLUMN IF EXISTS "first_admin_id",
DROP COLUMN IF EXISTS "subdomain",
ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- AlterTable
ALTER TABLE "user_campus_access"
DROP COLUMN IF EXISTS "user_id",
ADD COLUMN IF NOT EXISTS "profile_id" UUID;

-- DropTable
DROP TABLE IF EXISTS "platform_users";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "employees_profile_id_key" ON "employees"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "students_auth_user_id_key" ON "students"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_campus_access_profile_id_idx" ON "user_campus_access"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_campus_access_profile_id_campus_id_key" ON "user_campus_access"("profile_id", "campus_id");

-- AddForeignKey
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_profile_id_fkey";
ALTER TABLE "employees" ADD CONSTRAINT "employees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_campus_access" DROP CONSTRAINT IF EXISTS "user_campus_access_profile_id_fkey";
ALTER TABLE "user_campus_access" ADD CONSTRAINT "user_campus_access_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure only one active primary admin per tenant
CREATE UNIQUE INDEX IF NOT EXISTS tenant_one_primary_admin_active
ON "TenantMembership"("tenantId")
WHERE "is_primary_admin" = true AND "status" = 'ACTIVE';
