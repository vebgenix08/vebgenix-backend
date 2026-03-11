-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ResetTokenPurpose" AS ENUM ('INVITE_SET_PASSWORD', 'FORGOT_PASSWORD');

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_auth_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_campus_access" DROP CONSTRAINT "user_campus_access_user_id_fkey";

-- DropIndex
DROP INDEX "employees_auth_user_id_key";

-- DropIndex
DROP INDEX "tenants_subdomain_key";

-- DropIndex
DROP INDEX "user_campus_access_user_id_campus_id_key";

-- DropIndex
DROP INDEX "user_campus_access_user_id_idx";

-- AlterTable
ALTER TABLE "PasswordResetToken" DROP COLUMN "createdAt",
DROP COLUMN "expiresAt",
DROP COLUMN "tokenHash",
DROP COLUMN "usedAt",
ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expires_at" TIMESTAMPTZ NOT NULL,
ADD COLUMN     "last_attempt_at" TIMESTAMPTZ,
ADD COLUMN     "membership_id" UUID,
ADD COLUMN     "purpose" "ResetTokenPurpose" NOT NULL,
ADD COLUMN     "tenant_id" UUID,
ADD COLUMN     "token_hash" TEXT NOT NULL,
ADD COLUMN     "used_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "TenantMembership" ADD COLUMN     "activated_at" TIMESTAMPTZ,
ADD COLUMN     "disabled_at" TIMESTAMPTZ,
ADD COLUMN     "invited_at" TIMESTAMPTZ,
ADD COLUMN     "invited_by_user_id" UUID,
ADD COLUMN     "is_primary_admin" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "status",
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "auth_user_id",
ADD COLUMN     "profile_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "password_hash",
DROP COLUMN "reset_token",
DROP COLUMN "reset_token_expiry",
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "auth_user_id" UUID;

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "first_admin_id",
DROP COLUMN "subdomain",
ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "user_campus_access" DROP COLUMN "user_id",
ADD COLUMN     "profile_id" UUID NOT NULL;

-- DropTable
DROP TABLE "platform_users";

-- CreateIndex
CREATE UNIQUE INDEX "employees_profile_id_key" ON "employees"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_auth_user_id_key" ON "students"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "user_campus_access_profile_id_idx" ON "user_campus_access"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_campus_access_profile_id_campus_id_key" ON "user_campus_access"("profile_id", "campus_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_campus_access" ADD CONSTRAINT "user_campus_access_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure only one active primary admin per tenant
CREATE UNIQUE INDEX IF NOT EXISTS tenant_one_primary_admin_active
ON "TenantMembership"("tenantId")
WHERE "is_primary_admin" = true AND "status" = 'ACTIVE';
