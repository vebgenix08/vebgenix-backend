# CI/CD Deployment

## Files Found
- [.github/workflows/deploy-dev.yml](E:/APPLICATION/vebgenix-backend-main/.github/workflows/deploy-dev.yml)
- [.github/workflows/deploy-backend-prod.yml](E:/APPLICATION/vebgenix-backend-main/.github/workflows/deploy-backend-prod.yml)
- [.github/workflows/deploy-lambdas.yml](E:/APPLICATION/vebgenix-backend-main/.github/workflows/deploy-lambdas.yml)
- [.github/workflows/terraform.yml](E:/APPLICATION/vebgenix-backend-main/.github/workflows/terraform.yml)

## Build Command
`npm run build`

## Typecheck Command
`npm run typecheck`

## Test Command
No dedicated backend test command is defined at the root. If a service has tests, run them service by service.

## Deploy Command
- Dev: GitHub Actions workflow on `main`
- Prod: GitHub Actions workflow on `release`

## Environment Selection
- Dev workflow deploys with `-c env=dev`
- Prod workflow deploys with `-c env=prod`

## Required Secrets
- AWS OIDC role access
- Deployment environment secrets
- Runtime secrets injected through CloudFormation / secret references

## Deployment Order
1. Install dependencies
2. Run typecheck
3. Deploy CDK stacks
4. Print stack outputs

## Rollback Notes
Rollback is stack-based. Re-run the previous known-good deployment or revert the branch and redeploy.

## Output Rule
Generated build output is derived from source and should not be edited manually.

## Dev Deployment
Use the `deploy-dev.yml` workflow or the equivalent CDK command with `env=dev`.

## Prod Deployment
Use the `deploy-backend-prod.yml` workflow or the equivalent CDK command with `env=prod`.

