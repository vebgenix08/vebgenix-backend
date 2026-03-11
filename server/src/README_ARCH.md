# Backend Architecture

This directory (`server/src`) contains the **Domain Logic** for the Vebgenix ERP.

## Structure

*   **`domain/`**: Pure business logic, entities, and policies. **NO** Framework code (Express/Lambda) here.
*   **`application/`**: Use Cases / Orchestrators (e.g., `SubmitApplication`).
*   **`infrastructure/`**: Database clients, S3 adapters, Cognito wrappers.
*   **`interfaces/graphql/`**: Resolvers and Handlers for AWS AppSync.
*   **`interfaces/events/`**: Handlers for EventBridge/SQS workers.

## Key Rules

1.  **Authorization**: All authorization happens in `domain/identity/services.ts` via `IdentityService.getContext()`.
2.  **Database**: Access via `infrastructure/prisma/client.ts`.
3.  **Tenancy**: Every query MUST include `where: { tenantId }`.
4.  **Entry Points**: The public API is AWS AppSync. The Express app (`interfaces/http`) is **DEPRECATED** and will be removed.

## New Identity Model

*   **AuthUser**: Login identity (Cognito Link).
*   **TenantMembership**: Access to a tenant.
*   **RoleDefinition**: Configurable roles (e.g., "Admissions Officer").
*   **Student**: A domain entity, NOT a role. Linked via `StudentAuthLink`.

## Deployment

The infrastructure code in `aws-infrastructure` uses `NodejsFunction` to bundle this source code.

**Prerequisites:**
1.  Run `npx prisma generate` in `server/` to generate the client.
2.  Ensure `@aws-sdk/client-secrets-manager` is available (provided by Lambda runtime, but needed for types).

**Deploy:**
```bash
cd aws-infrastructure
cdk deploy --all
```
