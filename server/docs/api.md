# Vebgenix Backend API (REST)

This document describes the REST API implemented in the Node/Express server under `server/src`. The server mounts all routes under `/api`.

## Base URL

- Local: `http://localhost:5000/api`

## Conventions

### Authentication

- Most endpoints require `Authorization: Bearer <access_token>`.
- Login creates an HTTP-only cookie `refresh_token` used by:
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `POST /auth/switch-tenant`

### Tenant Resolution

Tenant is resolved by UUID (slug/subdomain are not accepted):

1. `:tenantId` route parameter (e.g. `/api/tenants/:tenantId/*`)
2. JWT claim `tenant_id`
3. Dev-only header `X-Tenant-Id` (only when `NODE_ENV=development`)

### Campus Context

Many tenant-scoped endpoints require a campus context:

- Header: `X-Campus-Id: <campus_uuid>`
- If missing, the server may auto-pick a campus depending on user role and campus access rules.

### Common Response Shapes

- Errors are typically returned as:
  - `{ code, message }` or `{ error: { code?, message } }`
- Success responses vary by controller (some wrap in `{ data: ... }`, others return the object directly).

## Health

### `GET /health`

Simple health check.

Response:

```json
{ "ok": true }
```

## Auth

### `POST /auth/login`

Email/password login for staff/admin users.

Body:

```json
{ "email": "user@example.com", "password": "string" }
```

Responses:

- `200 OK` (single-tenant or platform user):

```json
{
  "access_token": "jwt",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "global_roles": ["PLATFORM_SUPER_ADMIN"],
    "context": {
      "tenantId": "uuid",
      "role": "ORG_ADMIN",
      "campusScope": "ALL",
      "primaryProfileId": "uuid"
    }
  }
}
```

- `200 OK` (multi-tenant account requires selection):

```json
{
  "message": "Select tenant",
  "requires_selection": true,
  "available_tenants": [
    { "tenantId": "uuid", "tenantName": "Tenant A", "role": "ORG_ADMIN", "campusScope": "ALL" }
  ]
}
```

Notes:
- Sets cookie `refresh_token` on success.

### `POST /auth/switch-tenant`

Select a tenant context after login (requires `refresh_token` cookie).

Body:

```json
{ "tenantId": "uuid" }
```

Response:

```json
{ "access_token": "jwt" }
```

### `POST /auth/refresh`

Rotate refresh token and issue a new access token (requires `refresh_token` cookie).

Response:

```json
{ "access_token": "jwt" }
```

### `POST /auth/logout`

Revokes the refresh session and clears cookie.

Response:

```json
{ "message": "Logged out" }
```

### `POST /auth/forgot-password`

Send a 6-digit verification code to the user email (if registered).

Body:

```json
{ "email": "user@example.com" }
```

Response:

```json
{ "message": "If registered, email sent." }
```

### `POST /auth/reset-password` (alias: `/auth/confirm-forgot-password`)

Reset password using email + verification code.

Body (any of these field names are accepted):

```json
{ "email": "user@example.com", "code": "123456", "newPassword": "string" }
```

Response:

```json
{ "message": "Password updated successfully. You can now log in." }
```

### `GET /auth/whoami`

Returns claims from access token.

Response:

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "global_roles": [],
  "context": { "tenant_id": "uuid", "role": "ORG_ADMIN", "campus_scope": "ALL" }
}
```

### `GET /me`

Tenant-aware “current user” payload. Requires tenant + campus context.

Response (shape used by frontend):

```json
{
  "user": {
    "id": "auth_user_uuid",
    "profile_id": "profile_uuid",
    "email": "user@example.com",
    "full_name": "Full Name",
    "role": "ORG_ADMIN",
    "allCampusesAccess": true,
    "personaRole": null,
    "staffType": null,
    "permissions": []
  },
  "tenant": { "id": "uuid", "name": "Tenant", "slug": "tenant-slug" },
  "campus": { "campusId": "uuid", "campusType": "SCHOOL", "name": "Campus" },
  "features": [{ "feature_key": "ADMISSIONS", "enabled": true }],
  "featuresEnabled": ["ADMISSIONS"]
}
```

### `POST /auth/invite/verify`

Verify an invite token (used for “set password” invite flow).

Body:

```json
{ "token": "string", "email": "user@example.com", "userId": "uuid (optional)" }
```

Response:

```json
{ "valid": true, "userId": "uuid", "email": "user@example.com", "tenantName": "Tenant", "role": "TEACHER" }
```

### `POST /auth/invite/accept`

Accept invite by setting password and activating membership.

Body:

```json
{ "token": "string", "email": "user@example.com", "newPassword": "string", "userId": "uuid (optional)" }
```

Response:

```json
{ "message": "Password set successfully. You can now log in." }
```

## Tenant

Tenant endpoints are mounted twice:

- Preferred: `/tenants/:tenantId/*` (explicit tenant in URL)
- Legacy: `/tenant/*` (tenant inferred from JWT claim)

### `GET /tenant/me` (or `GET /tenants/:tenantId/me`)

Returns tenant details, user profile, accessible campuses, and enabled features.

### `GET /tenant/campuses` (ADMIN)

List all campuses in a tenant.

### `POST /tenant/campuses` (ADMIN)

Create a campus.

Body:

```json
{ "name": "Campus Name", "campus_type": "SCHOOL" }
```

### `PATCH /tenant/features` (ADMIN)

Update tenant feature flags.

Body:

```json
[
  { "feature_key": "ADMISSIONS", "enabled": true },
  { "feature_key": "FINANCE", "enabled": false }
]
```

## Admissions

### `POST /admissions/enquiries/public`

Public enquiry creation. Requires `tenant_id` and `campus_id` in request body.

Body:

```json
{
  "tenant_id": "uuid",
  "campus_id": "uuid",
  "full_name": "Student Name",
  "phone": "string"
}
```

### `GET /admissions/enquiries`

Query params:
- `status` (optional)
- `campusScope` (optional)
- `page` (default `1`)
- `limit` (default `10`)

### `PATCH /admissions/enquiries/:id/status`

Body:

```json
{ "status": "NEW", "notes": "optional" }
```

### `POST /admissions/applications`

Creates an application (tenant/campus injected from middleware).

### `GET /admissions/applications`

Query params:
- `status` (optional)
- `campusScope` (optional)
- `page` (default `1`)
- `limit` (default `10`)

### `GET /admissions/applications/:id`

Fetch application by id.

### `PATCH /admissions/applications/:id/status`

Body:

```json
{ "status": "UNDER_REVIEW" }
```

### `POST /admissions/applications/:id/enroll`

Enroll an application into a student.

Response:

```json
{ "message": "Student successfully enrolled", "studentId": "uuid" }
```

## Admin: Users

Mounted at `/admin/users`.

### `GET /admin/users`

Query params:
- `query` (search by name/email)
- `role` (or `all`)
- `status` (`active` | `inactive` | `all`)
- `campus_id` (filters users with access to that campus)
- `page` (default `1`)
- `limit` (default `20`)

### `GET /admin/users/:id`

Get a single user profile (tenant-scoped).

### `POST /admin/users`

Create or update a tenant user (invite flow).

Body:

```json
{
  "email": "user@example.com",
  "full_name": "Full Name",
  "role": "TEACHER",
  "all_campuses_access": false,
  "campus_ids": ["uuid"],
  "employee": {
    "employee_code": "EMP001",
    "phone": "string",
    "designation": "string",
    "department": "string",
    "joined_on": "2026-03-17"
  },
  "sendInvite": true
}
```

Notes:
- This endpoint forbids creating tenant `ADMIN` / `SUPER_ADMIN`. Those are platform-managed.
- Invite emails currently use a placeholder `mock-token-*` link (needs real invite token integration).

### `PATCH /admin/users/:id`

Partial update of profile/employee/campus access and activation status.

### `POST /admin/users/:id/resend-invite`

Resends invite email (placeholder link today).

### `POST /admin/users/:id/reset-password`

Sends reset email (placeholder link today).

## Admin: Students

Mounted at `/admin/students`.

### `GET /admin/students`

Query params:
- `page` (default `1`)
- `limit` (default `10`)
- `search` (name/regNo/email/phone)
- `status` (`all` by default)
- `scope` (`School` | `PU` | `All`)

### `POST /admin/students/:studentId/enable-portal`

Enable student portal access.

Body:

```json
{ "loginMode": "REGNO_ONLY", "sendInvite": true }
```

Notes:
- Uses placeholder email/invite token generation today.

### `POST /admin/students/:studentId/reset-password`

Creates a reset token and emails parent/admin fallback.

## Student Auth (Public)

### `POST /auth/student/login`

Body:

```json
{ "regNo": "REG-001", "password": "string", "tenantId": "uuid (optional if X-Tenant-Id header provided)" }
```

Response:

```json
{
  "token": "jwt",
  "user": { "id": "uuid", "email": "string", "role": "STUDENT", "fullName": "Student", "campusType": "PU" }
}
```

### `POST /auth/student/forgot-password`

Body:

```json
{ "regNo": "REG-001", "verification": "last4parentphone", "tenantId": "uuid (optional if X-Tenant-Id header provided)" }
```

Response:

```json
{ "message": "If valid, reset instructions sent." }
```

## Admin: Dashboard

Mounted at `/admin/dashboard`.

### `GET /admin/dashboard/summary`

Returns meta + KPI widgets + funnel + recent activity.

Important:
- Admissions widgets return `NOT_AVAILABLE` when:
  - feature `ADMISSIONS` disabled, or
  - user lacks permissions
- Finance widgets are currently stubbed as `NOT_AVAILABLE` in this endpoint.

### `GET /admin/dashboard/finance-summary`

Finance-only dashboard payload. Finance KPIs are currently WIP and return `NOT_AVAILABLE`.

## Platform (Super Admin)

Mounted at `/platform` and protected by platform super-admin middleware.

### `GET /platform/me`
### `GET /platform/tenants`
### `POST /platform/tenants`
### `PATCH /platform/tenants/:tenantId`
### `GET /platform/tenants/:tenantId/campuses`
### `POST /platform/tenants/:tenantId/campuses`
### `PATCH /platform/campuses/:campusId`
### `GET /platform/tenants/:tenantId/features`
### `PATCH /platform/tenants/:tenantId/features`
### `POST /platform/tenants/:tenantId/finalize`
### `POST /platform/tenants/:tenantId/first-admin`
### `POST /platform/users/:userId/resend-invite`
### `GET /platform/tenants/:tenantId/users`
### `POST /platform/tenants/:tenantId/users`
### `POST /platform/impersonate` (placeholder)

For exact payload shapes, see `PlatformController` implementation.

## What’s Implemented So Far

- Auth: login, refresh/logout, forgot/reset password, invite accept/verify, whoami, tenant-aware `/me`.
- Tenant: tenant context endpoints, campus management, feature flags.
- Admissions: enquiries + applications + enroll flow (via repository).
- Users: tenant staff management + campus access rules + invite/reset (placeholder links).
- Students: listing + portal enable + password reset.
- Dashboard: summary widgets + finance summary stub.
- Database: row-level security migration script for tenant isolation (PostgreSQL RLS).

## What Still Needs To Be Created (Recommended Next APIs)

### Finish invite/reset token flows (remove placeholders)

- Replace `mock-token-*` links in user/student invite/reset flows with real tokens:
  - Persist token, validate on callback endpoint, and allow password setup/reset without raw SQL.

### Finance module (REST)

There is a finance domain service, but REST endpoints are not yet exposed for:
- Fee heads CRUD
- Fee structures + versions
- Student fee assignment
- Collections/receipts, dues, refunds
- Dashboard finance KPIs implementation

### Settings & Masters

Domain services exist for settings, but REST endpoints are missing for:
- Academic years
- Programs/classes/sections
- Templates + template versions
- Tenant-level configuration

### Identity & Authorization Admin

Add endpoints to manage:
- Roles and role definitions
- Role permissions and profile permissions
- Membership admin (activate/disable, campus scope changes)

### Student/Guardian data

Add endpoints for:
- Guardians CRUD and linking to students
- Parent portal flows (if applicable)
- Student profile updates (email/phone/section/stream)

### Audit logs

Expose tenant audit logs and platform audit logs for admin UIs.

