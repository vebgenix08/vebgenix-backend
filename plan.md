# Authentication Refactoring Plan: Unified Identity Model

## 1. Goal
Refactor the split `Profile` (tenant) and `PlatformUser` (admin) authentication into a single `AuthUser` identity model to support multi-tenancy, unified login, and better security.

## 2. Prisma Schema Changes

### 2.1 New Enums
- `AuthStatus`: ACTIVE, DISABLED
- `GlobalRole`: PLATFORM_SUPER_ADMIN, PLATFORM_SUPPORT
- `MembershipRole`: ORG_OWNER, ORG_ADMIN, TEACHER, STUDENT, PARENT, STAFF, ACCOUNTANT
- `RelationshipType`: SELF, CHILD, WARD, SPOUSE, OTHER

### 2.2 New Models
- **AuthUser**: The central identity.
- **AuthUserGlobalRole**: For platform-level access.
- **TenantMembership**: Links AuthUser to Tenant with a role.
- **UserProfileLink**: Links AuthUser to specific Profiles (e.g., Parent -> Child).
- **AuthSession**: For refresh token management.
- **PasswordResetToken**: For secure password resets.

### 2.3 Modified Models
- **Profile**:
    - Remove: `passwordHash`, `resetToken`, `resetTokenExpiry`.
    - Modify: `email` (remove global unique constraint, potentially make it unique per tenant or just indexed).
- **Student**:
    - Mark `portalAuthUserId` as deprecated (comment only, keep for now for backward compatibility).

## 3. Migration Strategy (Data Backfill)

We will create a script `scripts/migrate-auth.ts` to:
1.  **Migrate Platform Users**:
    - Create `AuthUser` from `PlatformUser`.
    - Create `AuthUserGlobalRole` (SUPER_ADMIN).
2.  **Migrate Profiles**:
    - Create `AuthUser` from `Profile`.
    - Create `TenantMembership` (Role mapped from `Profile.role`).
    - Create `UserProfileLink` (SELF).
3.  **Conflict Handling**:
    - If an email exists in both tables, the script will **log an error and skip** (fail loudly) as requested, requiring manual intervention.

## 4. Implementation Steps

### Step 1: Update Prisma Schema
- Edit `server/prisma/schema.prisma` to add new models and enums.
- Edit `Profile` model to remove auth fields (or make them optional first to allow safe migration). *Strategy: Make them optional first, then remove in a cleanup phase.*

### Step 2: Generate & Push Schema
- Run `npx prisma generate`.
- Run `npx prisma db push`.

### Step 3: Run Migration Script
- Develop and run `server/scripts/auth-migration.ts`.

### Step 4: Refactor AuthController
- **Login**:
    - Query `AuthUser` by email.
    - Verify password.
    - Check `GlobalRole` and `TenantMembership`.
    - Generate Tokens (Access + Refresh).
- **Refresh Token**:
    - Validate hashed refresh token from DB.
    - Rotate token.
- **Switch Tenant**:
    - Verify membership.
    - Issue new Access Token.
- **Password Reset**:
    - Use `PasswordResetToken` table.

### Step 5: Verification
- Test Super Admin Login.
- Test Tenant User Login.
- Test Password Reset Flow.

## 5. Timeline
1.  Schema Update
2.  Migration Script
3.  Controller Refactor
4.  Testing
