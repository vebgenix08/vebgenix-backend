# How to Add a New Lambda

## Steps
1. Create the service folder under `apps/` or `apps/workers/`.
2. Add `package.json`.
3. Add `src/handler.ts`.
4. Add `src/routes.ts` if the Lambda is request routed.
5. Add `src/use-cases/*.ts`.
6. Add CDK Lambda wiring.
7. Add the AppSync data source or event trigger.
8. Add environment variables.
9. Add IAM permissions.
10. Build and deploy.

## Minimal Service Pattern
Use the same practical structure as the cleaned services:
- `handler.ts`
- `routes.ts`
- `use-cases/*.ts`
- one helper file only if needed

