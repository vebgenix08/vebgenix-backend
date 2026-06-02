# Dev / Prod Switching

## How Environment Is Configured
- CDK stage is set with `-c env=dev` or `-c env=prod`
- GitHub Actions use the matching branch/workflow
- Config lives in `aws-infrastructure/config/dev.ts` and `aws-infrastructure/config/prod.ts`

## Different Resources Per Env
- Stacks are suffixed with `-dev` or `-prod`
- AppSync, auth, storage, async, monitoring, and frontend stacks are environment-specific

## Naming Conventions
- Lambda names include the service name and environment
- AppSync API and stack names include the environment
- Storage and Cognito resources are environment specific

## Local Frontend Switching
Use the correct backend endpoint and auth values for the target environment.

## Backend Switching
Deploy with the correct CDK context and workflow.

## Safety Checklist
- Verify environment
- Verify secrets
- Verify stack names
- Verify user pool and bucket targets
- Verify tenant context

