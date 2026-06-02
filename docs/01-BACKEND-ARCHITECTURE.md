# Backend Architecture

## Monorepo Structure
- `apps/` contains Lambda-backed services.
- `apps/workers/` contains worker Lambdas.
- `packages/` contains shared code such as db, permissions, auth, errors, and tenant helpers.
- `graphql/` contains the schema.
- `aws-infrastructure/` contains CDK.
- `infrastructure/terraform/` contains Terraform.

## apps/
Each service owns one backend domain. Current accepted pattern:
- `handler.ts`
- `routes.ts`
- `<service>-utils.ts` or a shared utility file when needed
- `use-cases/*.ts`

## packages/
- `packages/db`: models and repositories
- `packages/permissions`: permission checks and helpers
- `packages/auth`: auth context and Cognito helpers
- `packages/errors`: shared error classes
- `packages/tenant`: tenant helpers

## graphql/
Schema definition and shared GraphQL types live here. AppSync uses this schema when the stacks are synthesized.

## aws-infrastructure/
CDK owns the AWS stacks:
- network
- auth
- storage
- async jobs
- monitoring
- AppSync
- frontend
- OIDC / GitHub deploy access

## infrastructure/terraform/
Terraform owns the infrastructure that is intentionally separate from CDK. If a resource is managed in both places, treat it as a risk and verify ownership before changing it.

## scripts/
- `npm run build`
- `npm run typecheck`
- `npm run dev`
- `npm run clean`
- `npm run build:schema`

## Service Folder Standard
One feature = one use-case file. Do not over-split into action files unless a feature file becomes too large.

## Lambda Request Flow
```text
Frontend
-> AppSync GraphQL
-> AppSync resolver
-> Lambda service
-> handler.ts
-> routes.ts
-> use-cases/*.ts
-> repository / model
-> MongoDB / S3 / Cognito / external service
```

