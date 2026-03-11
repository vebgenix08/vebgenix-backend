# Security Architecture Redesign: Multi-Tenant Education ERP

## 1. Weaknesses in Current Setup
Your current setup relies on patterns that are insufficient for a secure, multi-tenant SaaS:
*   **Blind Trust of Headers**: Using `x-tenant-id` or `X-Campus-Id` from the frontend without strict backend validation against the user's database membership allows horizontal privilege escalation (e.g., a user from Tenant A accessing Tenant B just by changing a header).
*   **Simple Role Strings**: `allowed={["admin"]}` is brittle. It doesn't handle granular permissions (e.g., "can view students" vs "can edit grades") or custom roles created by tenants.
*   **LocalStorage Tokens**: While common, storing JWTs in `localStorage` exposes them to XSS attacks. If a malicious script runs on your page, it can steal the token and impersonate the user.
*   **Frontend-Driven Context**: Relying on the URL or frontend state to define "security context" is dangerous. The backend must derive context from the authenticated identity + validated request parameters.

## 2. Final Authentication Architecture
**Amazon Cognito** is the single source of truth for **Authentication (AuthN)** - "Who are you?".

*   **User Pool**: Stores all users (Staff, Admins, Students, Parents).
*   **Identity**: Users log in via Cognito SRP (Secure Remote Password) protocol (handled by Amplify).
*   **Tokens**: Cognito issues ID, Access, and Refresh tokens.
*   **Session**: Managed by Amplify (automatically handles refresh).
*   **MFA**: Enforced by Cognito policies.

## 3. Final Authorization Architecture
**PostgreSQL (Prisma)** is the single source of truth for **Authorization (AuthZ)** - "What can you do?".

*   **Policy Decision Point (PDP)**: The `IdentityService` in your Domain Layer.
*   **Inputs**: Authenticated User ID (from Cognito) + Target Tenant ID (from Header) + Target Campus (from Header/Args).
*   **Resolution**:
    1.  Fetch `AuthUser` from DB using Cognito Sub (Subject ID).
    2.  Fetch `TenantMembership` for the target Tenant.
    3.  **STOP** if membership is missing or inactive.
    4.  Resolve `RoleDefinition` -> `RolePermission`.
    5.  Resolve `CampusScope` (Intersection of User's allowed campuses vs. Requested campus).
*   **Output**: A hydrated `AuthContext` object containing a set of Permissions (e.g., `student.view`) and allowed Campus IDs.

## 4. AppSync Auth Workflow
1.  **Mode**: `AMAZON_COGNITO_USER_POOLS`.
2.  **Request**: Frontend sends GraphQL request with:
    *   `Authorization`: Bearer <Cognito Access Token>
    *   `x-tenant-id`: Target Tenant UUID (Context)
3.  **Resolution (Lambda)**:
    *   Extract `sub` (User ID) from `event.identity`.
    *   Extract `tenantId` from `event.request.headers`.
    *   Call `IdentityService.getContext(sub, tenantId)`.
    *   Service validates membership and returns Permissions.
    *   Resolver checks `ctx.permissions.has('required.permission')`.

## 5. Responsibility Split
| Feature | Owner | Mechanism |
| :--- | :--- | :--- |
| **Login / Logout** | Cognito | Amplify Auth SDK |
| **Password Reset** | Cognito | Built-in flows |
| **Token Refresh** | Cognito | Refresh Token |
| **Tenant Access** | **Database** | `TenantMembership` table check |
| **Role Assignment** | **Database** | `MemberRole` table |
| **Permissions** | **Database** | `RolePermission` table |
| **Campus Scoping** | **Database** | `UserCampusAccess` table |

**Cognito DOES NOT know about your Tenants, Roles, or Campuses.** It only knows "User X exists".

## 6. Tenant & Campus Validation Rules
1.  **Tenant Context**:
    *   Frontend sends `x-tenant-id`.
    *   Backend **MUST** query: `SELECT * FROM TenantMembership WHERE userId = $sub AND tenantId = $headerTenantId AND status = 'ACTIVE'`.
    *   If no result, reject request (403 Forbidden).
    *   **NEVER** trust the header without this DB check.

2.  **Campus Context**:
    *   Frontend sends `x-campus-id` (optional).
    *   Backend checks: `if (!ctx.allowedCampusIds.includes(headerCampusId)) throw Error`.
    *   For list queries (e.g., `listStudents`), if no campus header is provided, the backend applies a **Filter**: `WHERE campusId IN (...ctx.allowedCampusIds)`.

## 7. Frontend Changes
1.  **Library**: Switch to `@aws-amplify/auth` and `@aws-amplify/api-graphql`.
2.  **Bootstrap**: Remove `/api/auth/whoami`. Replace with:
    *   `Auth.currentAuthenticatedUser()` to get Cognito User.
    *   GraphQL Query `me { permissions, roles, tenantId, allowedCampuses }` to get AuthZ context.
3.  **Guards**:
    *   **Remove**: `allowed={["admin"]}`.
    *   **Add**: `requiredPermission="student.create"`.
    *   Create a `<Can I="permission" />` component that checks the permissions array fetched from `me`.
4.  **Tenant Switch**:
    *   Just change the `x-tenant-id` header in your API client configuration.
    *   Refetch `me` to get permissions for the new tenant.
    *   No need to re-login (Cognito token is global for the user).

## 8. Refactoring Guide
*   **Keep**: The Visual Design, React Router structure.
*   **Refactor**:
    *   `ProtectedRoute` -> `PermissionRoute`.
    *   API Client -> Add an interceptor to inject `x-tenant-id` from global state.
*   **Remove**:
    *   Custom JWT parsing logic.
    *   Express middleware (`server/src/interfaces/http`).
    *   Hardcoded role checks.

## 9. Phased Migration Plan
1.  **Phase 1 (Backend Core)**: Deploy `IdentityService` and AppSync. (Done).
2.  **Phase 2 (Dual Auth)**: Allow both Legacy JWT and Cognito Token in resolvers (optional, usually better to cut over).
3.  **Phase 3 (Frontend Auth)**: Replace Login page with Cognito integration.
4.  **Phase 4 (Context)**: Update Frontend API client to send `x-tenant-id`.
5.  **Phase 5 (Cleanup)**: Remove old Express routes and DB columns related to legacy auth.

## 10. Critical Security Rules
1.  **Zero Trust**: The backend assumes the frontend is compromised. Every ID (Tenant, Campus, Student) sent from client must be authorized against the Actor.
2.  **Least Privilege**: `IdentityService` defaults to **NO ACCESS** unless a valid Membership record exists.
3.  **Scoped Queries**: Every database query must include `where: { tenantId: ctx.tenantId }`. Never query by ID alone (IDOR protection).
4.  **Permission Strings**: Use constants (e.g., `PERMISSIONS.STUDENT_VIEW`) instead of raw strings to avoid typos security holes.
