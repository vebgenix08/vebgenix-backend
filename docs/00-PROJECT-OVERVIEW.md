# Project Overview

## Project Name
Vebgenix backend monorepo.

## Backend Purpose
Provides the GraphQL, REST, webhook, and worker APIs for the platform. The backend owns tenant-aware business logic, persistence, auth, uploads, reports, and async jobs.

## Main Services
- `finance-service`
- `academics-service`
- `admissions-service`
- `identity-service`
- `settings-service`
- `comms-service`
- `results-service`
- `storage-service`
- `admin-cleanup-service`
- `workers/cognito-sync`
- `workers/email-worker`
- `workers/jobs-worker`

## Main AWS Services Used
- AppSync
- Lambda
- Cognito
- S3
- EventBridge / SQS
- CloudWatch
- IAM
- CDK
- Terraform

## GraphQL/AppSync Overview
GraphQL schema lives in [`graphql/schema.graphql`](E:/APPLICATION/vebgenix-backend-main/graphql/schema.graphql). AppSync resolver wiring is owned by CDK in [`aws-infrastructure/lib/stacks/appsync-stack.ts`](E:/APPLICATION/vebgenix-backend-main/aws-infrastructure/lib/stacks/appsync-stack.ts).

## Lambda Overview
Most domain services use the same pattern:
- `handler.ts`
- `routes.ts`
- `use-cases/*.ts`
- shared helper file if needed

## Database Overview
MongoDB-backed models and repositories live in [`packages/db/src`](E:/APPLICATION/vebgenix-backend-main/packages/db/src).

## Storage Overview
S3 is used for signed upload and download URLs. Receipt PDF is generated on demand only and is not stored in S3 or the database.

## Authentication / Authorization Overview
- Cognito provides user authentication.
- Tenant and role checks are enforced through permissions and tenant context.
- Platform admin bypass is used in the permission helper.

## Multi-Tenant Overview
Most business APIs require tenant context. Settings controls tenant creation, onboarding, and feature toggles.

## Development Workflow Summary
1. Edit source in `apps/*/src` and `packages/*/src`.
2. Update GraphQL or resolver wiring if needed.
3. Run typecheck and build.
4. Deploy through the correct dev/prod workflow.

