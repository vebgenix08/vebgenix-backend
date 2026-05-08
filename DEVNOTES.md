# Vebgenix Backend — Developer Notes

---

## Table of Contents
1. [Project Architecture](#1-project-architecture)
2. [Tech Stack](#2-tech-stack)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Environment Separation (Dev vs Prod)](#4-environment-separation-dev-vs-prod)
5. [Deployment Workflow](#5-deployment-workflow)
6. [Local Development](#6-local-development)
7. [Lambda & AppSync — How They Work](#7-lambda--appsync--how-they-work)
8. [VPC — What It Is and Current Status](#8-vpc--what-it-is-and-current-status)
9. [Postman Collection](#9-postman-collection)
10. [Code Patterns — toGql](#10-code-patterns--togql)
11. [Shared Packages — Important Rule](#11-shared-packages--important-rule)
12. [GraphQL Schema — Important Rule](#12-graphql-schema--important-rule)
13. [Secrets Management](#13-secrets-management)
14. [Quick Command Reference](#14-quick-command-reference)

---

## 1. Project Architecture

```
Browser / Mobile
      ↓
AWS AppSync (GraphQL API)
      ↓
AWS Lambda (one per domain service)
      ↓
MongoDB Atlas (database)
```

- **AppSync** = GraphQL gateway. Validates requests, routes to correct Lambda.
- **Lambda** = Business logic. One function per service (finance, academics, etc.).
- **MongoDB Atlas** = Database hosted outside AWS. Lambdas connect directly over internet.
- **Cognito** = User authentication. Issues JWT tokens. AppSync validates them.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| API | AWS AppSync (GraphQL) |
| Compute | AWS Lambda (Node.js 20) |
| Database | MongoDB Atlas (via Mongoose) |
| Auth | AWS Cognito User Pool |
| Storage | AWS S3 |
| Events | AWS EventBridge + SQS |
| IaC | AWS CDK (TypeScript) |
| Bundler | esbuild (via CDK NodejsFunction) |
| Monorepo | Turborepo |
| CI/CD | GitHub Actions + AWS OIDC |

---

## 3. Monorepo Structure

```
vebgenix-backend-main/
├── apps/
│   ├── academics-service/       ← Classes, sections, students, exams, promotions
│   ├── admissions-service/      ← Enquiries, applications, document workflow
│   ├── finance-service/         ← Fee heads, structures, invoices, payments
│   ├── identity-service/        ← Users, roles, staff management
│   ├── settings-service/        ← Campuses, academic years, programs, templates
│   ├── comms-service/           ← Announcements, events, leave requests
│   ├── results-service/         ← Public result batches
│   ├── storage-service/         ← S3 upload/download URLs
│   ├── admin-cleanup-service/   ← Duplicate student detection, merge
│   └── workers/
│       ├── email-worker/        ← Sends emails via EventBridge
│       ├── jobs-worker/         ← Scheduled background jobs
│       └── cognito-sync/        ← Syncs Cognito on user confirm
├── packages/
│   ├── db/                      ← Mongoose models + repositories (shared)
│   ├── auth/                    ← JWT resolution, context
│   ├── errors/                  ← AppError class
│   ├── permissions/             ← authorize() helper
│   ├── audit/                   ← AuditLogger
│   └── tenant/                  ← getTenantId() helper
├── aws-infrastructure/          ← CDK stacks
├── graphql/
│   └── schema.graphql           ← SINGLE SOURCE OF TRUTH for GraphQL schema
├── postman/
│   ├── build-collection.js      ← Generator script for Postman collection
│   ├── Vebgenix-API.postman_collection.json
│   └── Vebgenix-Dev.postman_environment.json
└── scripts/
    └── build-schema.mjs         ← Syncs schema to CDK folder
```

---

## 4. Environment Separation (Dev vs Prod)

Dev and prod are **completely separate AWS resources** — not the same resource with a flag.

### Resource naming

```
Lambda:   vebgenix-finance-resolver-dev    /   vebgenix-finance-resolver-prod
AppSync:  vebgenix-dev                     /   vebgenix-prod
Stacks:   VebgenixAppSync-dev              /   VebgenixAppSync-prod
```

### Separate secrets (AWS Secrets Manager)

```
vebgenix/dev/mongodb     → dev MongoDB Atlas URI
vebgenix/prod/mongodb    → prod MongoDB Atlas URI
vebgenix/dev/razorpay    → Razorpay test keys
vebgenix/prod/razorpay   → Razorpay live keys
```

Secrets are injected via CloudFormation dynamic references — never hardcoded:
```ts
MONGODB_URI: `{{resolve:secretsmanager:vebgenix/${config.stage}/mongodb:SecretString:uri}}`
```

### Environment variables inside every Lambda

| Variable | Dev | Prod |
|---|---|---|
| `STAGE` | `dev` | `prod` |
| `MONGODB_URI` | dev Atlas URI | prod Atlas URI |
| `COGNITO_USER_POOL_ID` | dev pool | prod pool |
| `EVENT_BUS_NAME` | dev bus | prod bus |
| `DOCUMENTS_BUCKET` | dev S3 | prod S3 |

### Behaviour differences

| Setting | Dev | Prod |
|---|---|---|
| Lambda minified | No | Yes |
| Source maps | Yes | No |
| AppSync logging | ALL fields | Errors only |
| Log retention | 7 days | 90 days |
| WAF protection | Off | On |
| S3 encryption | SSE-S3 | SSE-KMS |

### How stage is selected

```bash
npx cdk deploy --all -c env=dev    # selects devConfig
npx cdk deploy --all -c env=prod   # selects prodConfig
```

---

## 5. Deployment Workflow

### Automatic (recommended)

```
Push to main branch    →  GitHub Actions  →  CDK deploy --all -c env=dev
Push to release branch →  GitHub Actions  →  CDK deploy --all -c env=prod
```

### What GitHub Actions does

```
1. npm ci                          (install deps)
2. npx turbo run typecheck         (check TypeScript)
3. npx cdk deploy --all -c env=dev (deploy everything)
```

### What CDK does during deploy

```
1. Reads TypeScript CDK stacks
2. Runs esbuild to bundle each Lambda (TypeScript → JS)
3. Uploads Lambda zips to S3
4. Creates/updates CloudFormation stacks
5. Lambda code is live ✅
```

### No manual build needed for Lambda code

CDK's `NodejsFunction` bundles your TypeScript automatically.  
**Exception**: shared `packages/*` must be built first (see section 11).

---

## 6. Local Development

### Option A — CDK Watch (best for active development)

Watches files and redeploys changed Lambda in ~15 seconds on every save:

```bash
cd aws-infrastructure
npx cdk watch VebgenixAppSync-dev -c env=dev
```

### Option B — Manual CDK deploy (selective, ~1-2 min)

```bash
cd aws-infrastructure

# Redeploy only AppSync + all Lambdas
npx cdk deploy VebgenixAppSync-dev -c env=dev --require-approval never

# Redeploy auth service Lambda
npx cdk deploy VebgenixAuth-dev -c env=dev --require-approval never

# Redeploy worker Lambdas
npx cdk deploy VebgenixAsync-dev -c env=dev --require-approval never

# Redeploy everything
npx cdk deploy --all -c env=dev --require-approval never
```

### Option C — Push to main (slowest, ~3-4 min)

```bash
git add .
git commit -m "fix: your change"
git push origin main
```

### What to run for each change type

| Changed | Command |
|---|---|
| Any `apps/*` Lambda code | `cdk deploy VebgenixAppSync-dev -c env=dev --require-approval never` |
| `graphql/schema.graphql` | `npm run build:schema` → then deploy AppSync stack |
| `packages/db` or any `packages/*` | `npm run build` → then deploy AppSync stack |
| Workers (email, jobs) | `cdk deploy VebgenixAsync-dev -c env=dev --require-approval never` |
| Cognito trigger | `cdk deploy VebgenixAuth-dev -c env=dev --require-approval never` |
| CDK infrastructure | `cdk deploy --all -c env=dev --require-approval never` |

### Type check locally (before pushing)

```bash
# All services at once
npx turbo run typecheck

# Single service
cd apps/finance-service && npx tsc --noEmit
```

### AWS credentials (one-time setup for local CDK)

```bash
# Verify credentials are working
aws sts get-caller-identity

# If not configured
aws configure
# Enter: Access Key ID, Secret Access Key, region: ap-south-1
```

---

## 7. Lambda & AppSync — How They Work

### Request flow

```
Postman / Frontend
      ↓
AppSync (validates JWT + GraphQL schema)
      ↓
Lambda (resolves the operation)
      ↓  
MongoDB Atlas
      ↓
Response back to client
```

### Lambda handler pattern

Each service has a handler that switches on the `fieldName` from AppSync:

```ts
export const handler = async (event) => {
  const operation = event.info.fieldName;  // e.g. "createCampus"
  const args = event.arguments;            // e.g. { input: { name: "Main" } }

  switch (operation) {
    case 'createCampus': ...
    case 'listCampuses': ...
  }
};
```

### ⚠️ Direct AWS console edits get overwritten

If you edit Lambda code or AppSync schema **directly in the AWS console**, those changes will be **lost on the next CDK deploy**.

**Always edit locally → deploy via CDK.**

If you already made console changes, copy the logic out manually before the next deploy:

```
1. Note what you changed in AWS console
2. Apply the same change to the local .ts file
3. npx tsc --noEmit (check no errors)
4. git commit && git push
```

---

## 8. VPC — What It Is and Current Status

### Current status: VPC is OFF

Both `dev.ts` and `prod.ts` have:
```ts
enableNat: false
enableDatabase: false
enableEc2Postgres: false
```

With these settings, **no VPC resources are created** and **Lambdas run outside the VPC**.

### How Lambdas connect without VPC

```
Lambda (outside VPC)
    ├──→ MongoDB Atlas      (direct internet)
    ├──→ Cognito            (AWS public endpoint)
    ├──→ Razorpay           (direct internet)
    └──→ AppSync/S3/SQS     (AWS public endpoints)
```

This works perfectly fine and costs nothing extra.

### When would you need VPC (`enableNat: true`)?

Only if:
- You switch from MongoDB Atlas to **RDS inside VPC**
- Compliance requires Lambdas in private subnets
- You need to restrict Lambda outbound to specific IPs

### Destroying existing VPC (to stop billing)

If VPC was previously deployed and is billing you:

```bash
cd aws-infrastructure

npx cdk destroy VebgenixNetwork-dev -c env=dev
npx cdk destroy VebgenixNetwork-prod -c env=prod
```

### What VPC costs when enabled

| Resource | Cost/month |
|---|---|
| NAT Gateway | ~$32 |
| Elastic IP | ~$3.60 |
| Interface VPC Endpoints (×6) | ~$42+ |
| **Total** | **~$78+/month** |

---

## 9. Postman Collection

### Files

```
postman/Vebgenix-API.postman_collection.json     ← import this into Postman
postman/Vebgenix-Dev.postman_environment.json    ← import this as environment
postman/build-collection.js                      ← generator script (run to rebuild)
postman/strip-stringify.js                       ← utility (already run, keep for reference)
```

### Stats

- **176 requests** covering the full workflow
- **All 176 have test scripts** that auto-save IDs to environment variables
- Variables chain automatically: `campus_id`, `academic_year_id`, `student_id`, etc.

### How to rebuild the collection

```bash
# After making changes to build-collection.js
node postman/build-collection.js
```

### Test order (full end-to-end workflow)

```
1. Auth → Get Token
2. Settings → Create Campus, Academic Year, Program
3. Finance → Create Fee Category, Head, Schedule, Structure
4. Academics → Create Class, Section
5. Admissions → Enroll Student
6. Finance → Assign Fee Structure, Get Invoices, Record Payment
7. Academics → Create Exam, Publish Results
8. Academics → Promote Students
```

---

## 10. Code Patterns — toGql

Every resolver that returns data uses a `toGql` helper:

```ts
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc));  // serialize + deserialize
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}
```

### Why it exists

| Problem | Solution |
|---|---|
| MongoDB stores primary key as `_id` | Renamed to `id` |
| GraphQL/frontend expects `id` | Provided correctly |
| Mongoose virtual `id` not in JSON by default | Forced via serialization |
| ObjectId objects don't serialize as strings | `JSON.parse(JSON.stringify())` handles it |
| `__v` (version key) exposed to frontend | Removed |

### Usage

```ts
// Single document
return toGql(await Campus.findOne({ tenantId, _id: id }).lean());

// List
const docs = await Class.find({ tenantId }).lean();
return docs.map(d => toGql(d));

// After create
const doc = await Section.create({ ...input, tenantId });
return toGql(doc.toObject());
```

---

## 11. Shared Packages — Important Rule

> **@vebgenix/* packages bundle from `dist/`, must rebuild before CDK deploy.**

If you change anything in `packages/db`, `packages/auth`, `packages/errors`, etc.:

```bash
# Step 1 — rebuild the package dist/
npm run build

# Step 2 — deploy
cd aws-infrastructure
npx cdk deploy VebgenixAppSync-dev -c env=dev --require-approval never
```

Skipping `npm run build` means CDK will bundle the **old** dist version.

---

## 12. GraphQL Schema — Important Rule

There are **two copies** of the schema — always keep them in sync:

```
graphql/schema.graphql                          ← EDIT THIS ONE
aws-infrastructure/lib/schema/schema.graphql    ← AUTO-GENERATED (never edit directly)
```

After any schema change:

```bash
npm run build:schema    # copies graphql/schema.graphql → aws-infrastructure/lib/schema/
```

Then deploy AppSync stack to apply the change to AWS.

---

## 13. Secrets Management

All secrets live in **AWS Secrets Manager** — never in code or `.env` files.

### Secret paths

```
vebgenix/dev/mongodb          → { uri: "mongodb+srv://..." }
vebgenix/prod/mongodb         → { uri: "mongodb+srv://..." }
vebgenix/dev/razorpay         → { keyId, keySecret, webhookSecret }
vebgenix/prod/razorpay        → { keyId, keySecret, webhookSecret }
```

### How to add/update a secret

```bash
# Create new secret
aws secretsmanager create-secret \
  --name "vebgenix/dev/your-secret" \
  --secret-string '{"key":"value"}'

# Update existing secret
aws secretsmanager put-secret-value \
  --secret-id "vebgenix/dev/mongodb" \
  --secret-string '{"uri":"mongodb+srv://new-uri"}'
```

### Accessing in Lambda code

```ts
// Secrets are injected as env vars by CDK — access normally
const uri = process.env.MONGODB_URI;         // already resolved by CloudFormation
const key = process.env.RAZORPAY_KEY_ID;
```

---

## 14. Quick Command Reference

### Daily development

```bash
# Type check all services
npx turbo run typecheck

# Type check one service
cd apps/finance-service && npx tsc --noEmit

# Watch mode (auto-redeploy on save)
cd aws-infrastructure && npx cdk watch VebgenixAppSync-dev -c env=dev

# Rebuild Postman collection
node postman/build-collection.js

# Sync GraphQL schema
npm run build:schema
```

### Deploying

```bash
cd aws-infrastructure

# Deploy everything to dev
npx cdk deploy --all -c env=dev --require-approval never

# Deploy only AppSync + Lambdas (most common)
npx cdk deploy VebgenixAppSync-dev -c env=dev --require-approval never

# Deploy to prod (usually done via push to release branch)
npx cdk deploy --all -c env=prod --require-approval never
```

### Checking AWS

```bash
# Verify AWS credentials
aws sts get-caller-identity

# List Lambda functions
aws lambda list-functions --query "Functions[?starts_with(FunctionName,'vebgenix')].FunctionName" --output table

# Get AppSync API ID
aws appsync list-graphql-apis --query "graphqlApis[?contains(name,'vebgenix')].{Name:name,Id:apiId}" --output table

# View Lambda logs (last 5 minutes)
aws logs tail /aws/lambda/vebgenix-finance-resolver-dev --since 5m

# Download deployed Lambda code
aws lambda get-function --function-name vebgenix-finance-resolver-dev --query 'Code.Location' --output text | xargs curl -o lambda.zip
```

### Destroying resources

```bash
# Destroy VPC (if billing for unused VPC)
npx cdk destroy VebgenixNetwork-dev -c env=dev
npx cdk destroy VebgenixNetwork-prod -c env=prod

# Destroy a specific stack
npx cdk destroy VebgenixAppSync-dev -c env=dev
```

### Git workflow

```bash
# Feature work → deploy to dev
git checkout -b feature/your-feature
git add . && git commit -m "feat: your change"
git push origin feature/your-feature
# Then merge to main → auto-deploys to dev

# Release to prod
git checkout release
git merge main
git push origin release
# Auto-deploys to prod
```
