# Lambda and AppSync Map

## How AppSync Connects to Lambda
AppSync field resolvers are configured in CDK and target Lambda services by domain.

## Routing Pattern
```text
GraphQL field
-> AppSync resolver
-> Lambda handler
-> route dispatcher
-> use-case file
```

## Current Service Route Files
- `apps/finance-service/src/routes.ts`
- `apps/academics-service/src/routes.ts`
- `apps/admissions-service/src/routes.ts`
- `apps/identity-service/src/routes.ts`
- `apps/settings-service/src/routes.ts`
- `apps/comms-service/src/routes.ts`
- `apps/results-service/src/routes.ts`
- `apps/storage-service/src/routes.ts`
- `apps/admin-cleanup-service/src/routes.ts`

## How to Add a Resolver
1. Add or update the GraphQL field.
2. Add the AppSync resolver mapping in CDK.
3. Add the route case in the service `routes.ts`.
4. Add or update the use-case function.
5. Run typecheck and build.

## How to Remove a Resolver
1. Remove the AppSync resolver mapping.
2. Remove the GraphQL field if it is no longer used.
3. Remove the route case and use-case function if the API is deleted.
4. Check for repository and frontend call sites.

## Verification Rule
When a GraphQL field exists but no route mapping exists, mark it as needs verification before deleting or reusing it.

