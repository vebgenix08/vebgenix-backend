# Infrastructure

## CDK Ownership
CDK under `aws-infrastructure/` owns:
- Network
- Cognito / auth
- S3 storage
- Async jobs
- Monitoring
- AppSync
- Frontend hosting
- GitHub OIDC
- Shared runtime deps layer
- Lambda bundling and resolver wiring
- Stack outputs consumed by deployment workflows

## Terraform Ownership
Terraform under `infrastructure/terraform/` owns:
- MongoDB Atlas project and cluster
- MongoDB Atlas database user
- MongoDB Atlas IP access list
- AWS Secrets Manager entries for MongoDB URIs
- AWS Secrets Manager entry for Razorpay keys in prod

## AppSync
AppSync is defined in CDK and wires GraphQL to Lambda services.

## Lambda
Lambda functions are bundled and deployed through CDK stacks.

## S3
S3 is used for private document storage and signed URL workflows.

## Cognito
Cognito user pool and client configuration are owned by CDK.

## IAM
IAM roles are created for deployment, Lambda access, and cross-service permissions.

## Secrets
Secrets are injected through deployment mechanisms rather than committed to source.

## Route 53 / VPC
Present in CDK stacks where required. Verify ownership before editing.

## Ownership Status
No direct resource ownership overlap was found between CDK and Terraform in the inspected files. The main boundary is:
- CDK consumes secrets and Atlas connection values
- Terraform creates MongoDB Atlas and the backing secrets

## One-Owner Rule
One AWS resource must be owned by one IaC tool only. If a resource appears in both CDK and Terraform, treat it as a risk and verify before changing it.
