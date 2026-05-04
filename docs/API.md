# Vebgenix Backend — Complete API Reference

> **Product:** Vebgenix — Multi-tenant SaaS ERP for colleges and schools  
> **Architecture:** AWS Lambda + AppSync GraphQL + MongoDB Atlas  
> **Auth:** AWS Cognito (no local auth)  
> **Last updated:** 2026-05-03

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Multi-Tenancy](#3-multi-tenancy)
4. [Environment Variables](#4-environment-variables)
5. [Deployment](#5-deployment)
6. [API — Identity](#6-api--identity)
7. [API — Admissions](#7-api--admissions)
8. [API — Finance](#8-api--finance)
9. [API — Academics](#9-api--academics)
10. [API — Settings](#10-api--settings)
11. [API — Comms](#11-api--comms)
12. [API — Results (Public)](#12-api--results-public)
13. [API — Storage](#13-api--storage)
14. [API — Admin Cleanup](#14-api--admin-cleanup-deduplication)
15. [Async Workers](#15-async-workers)
16. [Error Codes](#16-error-codes)
17. [Postman Collection](#17-postman-collection)

---

## 1. Architecture Overview

```
Browser / Mobile App
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│  CloudFront  (CDN + WAF)                                         │
└──────────────────────────────────────────────────────────────────┘
       │
   ┌───┴───────────────────┐
   │                       │
   ▼                       ▼
AppSync GraphQL API    API Gateway REST
(Cognito User Pool     (EC2 proxy server)
 Authorizer)
   │                       │
   └──────────┬────────────┘
              │
              ▼
    Lambda Resolvers (one per domain)
    ┌────────────────────────────────────────────────────────┐
    │ identity-service   admissions-service   finance-service│
    │ academics-service  settings-service     comms-service  │
    │ storage-service    results-service                     │
    └────────────────────────────────────────────────────────┘
              │
              ▼
    MongoDB Atlas (multi-tenant, tenantId on every document)
              │
              ▼
    EventBridge → SQS → Workers (email, background jobs)
```

**Key points:**
- AppSync verifies Cognito tokens before the Lambda is called — `event.identity.claims` is trusted directly inside Lambda
- API Gateway REST uses `Authorization: Bearer <CognitoAccessToken>` — the Lambda verifies via JWKS
- All Lambdas share the same `@vebgenix/db` package — one Mongoose connection pool per container
- Every DB document carries `tenantId` — cross-tenant access is impossible at the application layer

---

## 2. Authentication

### Token flow (Cognito)

```
POST https://cognito-idp.<region>.amazonaws.com/
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth
Content-Type: application/x-amz-json-1.1

{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "<COGNITO_CLIENT_ID>",
  "AuthParameters": {
    "USERNAME": "user@example.com",
    "PASSWORD": "P@ssw0rd!"
  }
}
```

**Response:**
```json
{
  "AuthenticationResult": {
    "AccessToken":  "eyJra...",
    "IdToken":      "eyJra...",
    "RefreshToken": "eyJjb...",
    "ExpiresIn":    3600,
    "TokenType":    "Bearer"
  }
}
```

Use `AccessToken` in all API requests.

### Refresh token

```
POST https://cognito-idp.<region>.amazonaws.com/
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth

{
  "AuthFlow": "REFRESH_TOKEN_AUTH",
  "ClientId": "<COGNITO_CLIENT_ID>",
  "AuthParameters": {
    "REFRESH_TOKEN": "<refresh_token>"
  }
}
```

### API Gateway requests

```
Authorization: Bearer <AccessToken>
x-tenant-id: <tenantId>         ← Required for all tenant-scoped requests
Content-Type: application/json
```

### AppSync requests

AppSync uses `Authorization: <AccessToken>` header (no `Bearer` prefix — AppSync handles it).

### Invited staff flow

1. Admin calls `inviteStaff` → Lambda calls `cognito-idp:AdminCreateUser`
2. Cognito sends email with temporary password
3. Staff sets new password on first login
4. PostConfirmation trigger syncs `cognitoSub` to MongoDB

---

## 3. Multi-Tenancy

Every resource in the database is scoped to a `tenantId`. The flow:

1. Cognito token contains `custom:tenantId` claim (set on user creation)
2. Lambda extracts `tenantId` from the claim (AppSync) or `x-tenant-id` header (REST)
3. Every MongoDB query includes `{ tenantId }` — cross-tenant access is blocked at application layer
4. Compound indexes on all models enforce tenant isolation at DB level

**Super Admin (platform admin):**
- `isPlatformAdmin: true` on their AuthUser record
- Can access all tenants' data
- Identified by absence of `custom:tenantId` claim + `isPlatformAdmin` flag in DB

---

## 4. Environment Variables

| Variable | Description | Where set |
|----------|-------------|-----------|
| `MONGODB_URI` | MongoDB Atlas connection string | AWS Secrets Manager → `vebgenix/<stage>/mongodb` key `uri` |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID | CDK stack environment |
| `COGNITO_CLIENT_ID` | Cognito App Client ID | CDK stack environment |
| `COGNITO_REGION` | AWS region | CDK stack environment |
| `RAZORPAY_KEY_ID` | Razorpay key ID | Secrets Manager → `vebgenix/<stage>/razorpay` key `keyId` |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret | Secrets Manager → `vebgenix/<stage>/razorpay` key `keySecret` |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook secret | Secrets Manager → `vebgenix/<stage>/razorpay` key `webhookSecret` |
| `EVENT_BUS_NAME` | EventBridge bus name | CDK stack environment |
| `DOCUMENTS_BUCKET` | S3 bucket for documents | CDK stack environment |
| `APP_BASE_URL` | Frontend base URL (for public result links) | CDK stack environment |
| `STAGE` | `dev` or `prod` | CDK stack environment |

**Local dev (`.env`):**
```env
MONGODB_URI=mongodb+srv://ags:<password>@applicationerp.tgbsmr6.mongodb.net/vebgenix_dev
COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=ap-south-1
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
APP_BASE_URL=http://localhost:3000
STAGE=dev
```

---

## 5. Deployment

### Prerequisites
- Node.js 20+
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS credentials configured
- MongoDB Atlas cluster with Secrets Manager entry

### First-time setup

```bash
# Install all workspace packages
npm install

# Bootstrap CDK (once per account/region)
cd aws-infrastructure
cdk bootstrap aws://<account>/<region>

# Deploy dev
cdk deploy --all --context stage=dev

# Deploy prod
cdk deploy --all --context stage=prod
```

### Secrets Manager setup (before first deploy)

```bash
# MongoDB URI
aws secretsmanager create-secret \
  --name "vebgenix/dev/mongodb" \
  --secret-string '{"uri":"mongodb+srv://ags:<pw>@applicationerp.tgbsmr6.mongodb.net/vebgenix_dev"}'

# Razorpay
aws secretsmanager create-secret \
  --name "vebgenix/dev/razorpay" \
  --secret-string '{"keyId":"rzp_test_xxx","keySecret":"xxx","webhookSecret":"xxx"}'
```

### CDK stacks

| Stack | Contents |
|-------|----------|
| `VpcStack` | VPC, subnets, security groups |
| `AuthStack` | Cognito User Pool + PostConfirmation trigger |
| `StorageStack` | S3 documents bucket, CloudFront |
| `AppSyncStack` | GraphQL API + all 8 Lambda resolvers |
| `AsyncStack` | SQS queues + email/jobs worker Lambdas + EventBridge rules |

---

## 6. API — Identity

**Base path:** `/api/identity` (REST) | AppSync resolvers

### GET /api/me
Returns the current user's profile.

**Response:**
```json
{
  "_id": "...",
  "email": "admin@college.com",
  "firstName": "John",
  "lastName": "Doe",
  "personaRole": "ADMIN",
  "tenantId": "...",
  "campusAccess": [{ "campusId": "...", "role": "ADMIN" }],
  "isActive": true
}
```

---

### GET /api/admin/users
List all users (staff + admin, excludes students).

**Query params:** `campusId`, `isActive`

---

### POST /api/admin/users
Create a user.

```json
{
  "email": "teacher@college.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "personaRole": "TEACHER",
  "campusId": "..."
}
```

---

### PATCH /api/admin/users/:id
Update user profile.

---

### DELETE /api/admin/users/:id
Deactivate user (soft delete). Sets `isActive: false`.

---

### POST /api/admin/users/:id/reactivate
Re-enable a deactivated user.

---

### POST /api/admin/staff
Invite staff via Cognito (sends email with temporary password).

```json
{
  "email": "staff@college.com",
  "firstName": "Mark",
  "lastName": "Lee",
  "staffType": "TEACHING",
  "campusId": "...",
  "role": "TEACHER"
}
```

---

### GET /api/admin/staff
List all staff members (`personaRole: STAFF | TEACHER`).

**Query params:** `campusId`

---

### Campus Access

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/users/:id/campus-access` | List campus access for user |
| `POST` | `/api/admin/users/:id/campus-access` | Grant campus access |
| `DELETE` | `/api/admin/users/:id/campus-access/:campusId` | Revoke campus access |

**Grant body:**
```json
{ "campusId": "...", "role": "VIEWER" }
```

---

### Roles

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/users/:id/roles` | Assign role |
| `DELETE` | `/api/admin/users/:id/roles/:role` | Remove role |

**Assign body:**
```json
{ "role": "FINANCE_MANAGER", "campusId": "..." }
```

---

### POST /api/admin/users/bulk-deactivate
Deactivate multiple users at once.

```json
{ "userIds": ["...", "...", "..."] }
```

---

## 7. API — Admissions

**Base path:** `/api/admissions` (REST) | AppSync resolvers

### Public Enquiry (no auth)

### POST /api/public/admissions/enquiries
Submit an enquiry from the public admission form.

```json
{
  "tenantId": "...",
  "campusId": "...",
  "studentName": "Alice Kumar",
  "email": "alice@gmail.com",
  "phone": "9876543210",
  "programId": "...",
  "notes": "Interested in B.Tech CSE"
}
```

**Response:** `{ "success": true, "id": "..." }`

---

### Enquiries (requires auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admissions/enquiries` | List enquiries |
| `GET`  | `/api/admissions/enquiries/:id` | Get single enquiry |
| `POST` | `/api/admissions/enquiries` | Create enquiry |
| `PATCH`| `/api/admissions/enquiries/:id` | Update enquiry |
| `DELETE`| `/api/admissions/enquiries/:id` | Delete enquiry |
| `POST` | `/api/admissions/duplicate-check` | Check duplicate by phone/email |

**List query params:** `status`, `campusId`, `programId`

**Duplicate check body:**
```json
{ "phone": "9876543210", "email": "alice@gmail.com" }
```

**Response:** enquiry document or `null`

---

### Applications

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admissions/applications` | List applications |
| `GET`  | `/api/admissions/applications/approval-queue` | Pending review queue |
| `GET`  | `/api/admissions/applications/:id` | Get application |
| `GET`  | `/api/admissions/applications/:id/reviews` | Get review history |
| `POST` | `/api/admissions/applications` | Create application |
| `POST` | `/api/admissions/applications/:id/submit` | Submit for review |
| `POST` | `/api/admissions/applications/:id/review` | Add review decision |
| `POST` | `/api/admissions/applications/:id/approve` | Approve |
| `POST` | `/api/admissions/applications/:id/reject` | Reject |
| `POST` | `/api/admissions/applications/:id/withdraw` | Withdraw |

**Review body:**
```json
{
  "decision": "UNDER_REVIEW",
  "remarks": "Documents need verification",
  "reviewedBy": "..."
}
```

**Document verification:**
```
POST /api/admissions/applications/:id/documents/:docKey/verify
```

---

### GET /api/admissions/stats
Returns counts: totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications.

---

## 8. API — Finance

**Base path:** `/api/admin/finance` (REST) | AppSync resolvers

### Fee Heads

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/fee-heads` | List fee heads |
| `POST` | `/api/admin/finance/fee-heads` | Create fee head |
| `PATCH`| `/api/admin/finance/fee-heads/:id` | Update fee head |
| `DELETE`| `/api/admin/finance/fee-heads/:id` | Deactivate fee head |

**Create body:**
```json
{
  "name": "Tuition Fee",
  "type": "TUITION",
  "description": "Main tuition fee"
}
```

---

### Fee Structures

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/fee-structures` | List (filter: `academicYearId`, `programId`) |
| `GET`  | `/api/admin/finance/fee-structures/:id` | Get single |
| `POST` | `/api/admin/finance/fee-structures` | Create |
| `PATCH`| `/api/admin/finance/fee-structures/:id` | Update |
| `DELETE`| `/api/admin/finance/fee-structures/:id` | Delete |

**Create body:**
```json
{
  "name": "B.Tech Year 1 - 2025",
  "academicYearId": "...",
  "programId": "...",
  "campusId": "...",
  "lineItems": [
    { "feeHeadId": "...", "amount": 50000 },
    { "feeHeadId": "...", "amount": 5000 }
  ],
  "totalAmount": 55000
}
```

---

### Fee Assignments

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/fee-assignments` | List (filter: `studentId`, `academicYearId`, `classId`) |
| `GET`  | `/api/admin/finance/fee-assignments/:id` | Get single |
| `GET`  | `/api/admin/finance/students/:studentId/fee-assignment` | Get for student |
| `POST` | `/api/admin/finance/fee-assignments` | Assign fee structure to student |
| `POST` | `/api/admin/finance/fee-assignments/bulk` | Bulk assign by classId or studentIds |

**Bulk assign body:**
```json
{
  "feeStructureId": "...",
  "academicYearId": "...",
  "classId": "..."
}
```

---

### Fee Schedules

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/fee-schedules` | List |
| `POST` | `/api/admin/finance/fee-schedules` | Create |
| `PATCH`| `/api/admin/finance/fee-schedules/:id` | Update |
| `DELETE`| `/api/admin/finance/fee-schedules/:id` | Delete |

---

### Installment Plans

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/installment-plans` | List |
| `POST` | `/api/admin/finance/installment-plans` | Create |
| `DELETE`| `/api/admin/finance/installment-plans/:id` | Delete |

---

### Invoices

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/invoices` | List (filter: `studentId`, `status`, `campusId`) |
| `GET`  | `/api/admin/finance/invoices/:id` | Get invoice |
| `GET`  | `/api/admin/finance/students/:studentId/invoices` | All invoices for student |
| `POST` | `/api/admin/finance/invoices` | Create invoice |
| `PATCH`| `/api/admin/finance/invoices/:id` | Update invoice |
| `POST` | `/api/admin/finance/invoices/:id/cancel` | Cancel invoice |
| `POST` | `/api/admin/finance/invoices/:id/revise` | Revise amount (creates audit trail) |
| `GET`  | `/api/admin/finance/invoices/:id/revisions` | Revision history |

**Create body:**
```json
{
  "studentId": "...",
  "academicYearId": "...",
  "campusId": "...",
  "lineItems": [{ "feeHeadId": "...", "amount": 55000, "description": "Year 1 fees" }],
  "grossAmount": 55000,
  "discount": 5000,
  "netAmount": 50000,
  "dueDate": "2025-06-30"
}
```

**Revise body:**
```json
{ "newAmount": 48000, "reason": "Scholarship applied" }
```

---

### Payments

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/payments` | List (filter: `invoiceId`, `studentId`, `status`) |
| `GET`  | `/api/admin/finance/payments/:id` | Get payment |
| `POST` | `/api/admin/finance/payments` | Record offline payment |
| `POST` | `/api/finance/payments/create-order` | Create Razorpay order |
| `POST` | `/api/finance/payments/verify` | Verify Razorpay signature |
| `POST` | `/api/webhook/razorpay` | Razorpay webhook (no auth) |

**Record offline payment:**
```json
{
  "invoiceId": "...",
  "studentId": "...",
  "amount": 50000,
  "method": "CASH",
  "collectedBy": "..."
}
```

**Create Razorpay order:**
```json
{ "invoiceId": "...", "amount": 50000 }
```

**Response:** `{ "orderId": "order_xxx", "amount": 5000000, "currency": "INR" }`

**Verify signature:**
```json
{
  "razorpayOrderId": "order_xxx",
  "razorpayPaymentId": "pay_xxx",
  "razorpaySignature": "xxx"
}
```

---

### Reports

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/finance/reports/day-book` | Day book (query: `from`, `to`) |
| `GET`  | `/api/admin/finance/reports/collection-analytics` | Monthly collection (query: `academicYearId`) |
| `GET`  | `/api/admin/finance/reports/class-stats` | Fee stats by class (query: `classId`, `academicYearId`) |
| `GET`  | `/api/admin/finance/students/:studentId/summary` | Student financial summary |

---

## 9. API — Academics

**Base path:** `/api/admin/academics` (REST) | AppSync resolvers

### Classes

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/classes` | List classes |
| `GET`  | `/api/admin/academics/classes/:id` | Get class |
| `POST` | `/api/admin/academics/classes` | Create class |
| `PATCH`| `/api/admin/academics/classes/:id` | Update class |
| `DELETE`| `/api/admin/academics/classes/:id` | Delete class |

**Create body:**
```json
{
  "name": "Class 10",
  "code": "CL10",
  "campusId": "...",
  "academicYearId": "...",
  "programId": "..."
}
```

---

### Sections

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/sections` | List all sections |
| `GET`  | `/api/admin/academics/sections/:id` | Get section |
| `GET`  | `/api/admin/academics/sections/:id/students` | Students in section |
| `POST` | `/api/admin/academics/sections` | Create section |
| `PATCH`| `/api/admin/academics/sections/:id` | Update section |
| `DELETE`| `/api/admin/academics/sections/:id` | Delete section |
| `PATCH`| `/api/admin/academics/sections/:id/incharge` | Set class incharge |
| `POST` | `/api/admin/academics/sections/:id/courses` | Assign subject to section |
| `DELETE`| `/api/admin/academics/sections/:id/courses/:subjectId` | Remove subject |

---

### Subjects

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/subjects` | List subjects |
| `GET`  | `/api/admin/academics/subjects/:id` | Get subject |
| `POST` | `/api/admin/academics/subjects` | Create subject |
| `PATCH`| `/api/admin/academics/subjects/:id` | Update subject |
| `DELETE`| `/api/admin/academics/subjects/:id` | Delete subject |

---

### Students

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/students` | List students (filter: `campusId`, `classId`, `sectionId`, `status`) |
| `GET`  | `/api/admin/academics/students/:id` | Get student |
| `POST` | `/api/admin/academics/students` | Enroll student |
| `PATCH`| `/api/admin/academics/students/:id` | Update student |
| `PATCH`| `/api/admin/academics/students/:id/status` | Update status (ACTIVE/INACTIVE/GRADUATED/etc.) |
| `PATCH`| `/api/admin/academics/students/:id/class` | Assign to class/section |
| `POST` | `/api/admin/academics/students/from-application` | Convert approved application to student |
| `POST` | `/api/admin/academics/students/bulk-assign` | Bulk assign to class |
| `POST` | `/api/admin/academics/students/random-assign` | Auto-distribute across sections |

**Enroll body:**
```json
{
  "firstName": "Ravi",
  "lastName": "Kumar",
  "dateOfBirth": "2007-05-15",
  "gender": "MALE",
  "phone": "9876543210",
  "email": "ravi@gmail.com",
  "campusId": "...",
  "classId": "...",
  "sectionId": "...",
  "academicYearId": "..."
}
```

---

### Attendance

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/attendance` | List attendance records |
| `GET`  | `/api/admin/academics/sections/:id/attendance` | Section attendance for a date |
| `GET`  | `/api/admin/academics/sections/:id/attendance/summary` | Summary report |
| `POST` | `/api/admin/academics/sections/:id/attendance` | Mark bulk attendance |

**Mark attendance body:**
```json
{
  "date": "2025-06-15",
  "subjectId": "...",
  "records": [
    { "studentId": "...", "status": "PRESENT" },
    { "studentId": "...", "status": "ABSENT" },
    { "studentId": "...", "status": "LATE" }
  ]
}
```

**Summary query params:** `from`, `to`

---

### Exams & Marks

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/exams` | List exams |
| `GET`  | `/api/admin/academics/exams/:id` | Get exam |
| `POST` | `/api/admin/academics/exams` | Create exam |
| `PATCH`| `/api/admin/academics/exams/:id` | Update exam |
| `DELETE`| `/api/admin/academics/exams/:id` | Delete exam |
| `POST` | `/api/admin/academics/exams/:id/marks` | Enter/submit marks |
| `POST` | `/api/admin/academics/exams/:id/publish` | Publish results |
| `GET`  | `/api/admin/academics/results` | List all result records |
| `GET`  | `/api/admin/academics/exams/:id/results` | Results for one exam |

**Enter marks body:**
```json
{
  "marks": [
    { "studentId": "...", "marksObtained": 85, "grade": "A" },
    { "studentId": "...", "marksObtained": 72, "grade": "B" }
  ]
}
```

---

### Timetable

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/sections/:id/timetable` | Section weekly timetable |
| `GET`  | `/api/admin/academics/teachers/:id/timetable` | Teacher schedule |
| `GET`  | `/api/admin/academics/teachers/:id/workload` | Teacher workload summary |
| `PUT`  | `/api/admin/academics/sections/:id/timetable` | Replace section timetable |

**Replace timetable body:**
```json
{
  "academicYearId": "...",
  "slots": [
    { "dayOfWeek": "MONDAY", "periodNumber": 1, "startTime": "09:00", "endTime": "09:50", "subjectId": "...", "teacherId": "..." }
  ]
}
```

---

### Certificates

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/academics/certificates` | List certificates |
| `POST` | `/api/admin/academics/certificates` | Issue certificate request |
| `POST` | `/api/admin/academics/certificates/:id/approve` | Approve certificate |

**Issue body:**
```json
{
  "studentId": "...",
  "type": "BONAFIDE",
  "reason": "Bank loan application"
}
```

---

## 10. API — Settings

**Base path:** `/api/admin/settings` (REST) | AppSync resolvers

### Tenant Settings

| Method | Path | Description |
|--------|------|-------------|
| `PATCH`| `/api/admin/settings/tenant` | Update own tenant info |
| `GET`  | `/api/admin/settings/features` | Get feature flags |
| `PATCH`| `/api/admin/settings/features` | Update feature flags (admin) |

**Feature flags body:**
```json
{
  "features": {
    "admissions": true,
    "finance": true,
    "academics": true,
    "timetable": true,
    "certificates": false,
    "leave": true
  }
}
```

---

### Campuses

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/settings/campuses` | List campuses |
| `GET`  | `/api/admin/settings/campuses/:id` | Get campus |
| `POST` | `/api/admin/settings/campuses` | Create campus |
| `PATCH`| `/api/admin/settings/campuses/:id` | Update campus |
| `DELETE`| `/api/admin/settings/campuses/:id` | Deactivate campus |

---

### Programs

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/settings/programs` | List programs |
| `GET`  | `/api/admin/settings/programs/:id` | Get program |
| `POST` | `/api/admin/settings/programs` | Create program |
| `PATCH`| `/api/admin/settings/programs/:id` | Update program |
| `DELETE`| `/api/admin/settings/programs/:id` | Deactivate program |

**Create body:**
```json
{
  "name": "Bachelor of Technology",
  "code": "BTECH",
  "type": "UNDERGRADUATE",
  "durationYears": 4,
  "campusId": "..."
}
```

---

### Academic Years

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/settings/academic-years` | List academic years |
| `GET`  | `/api/admin/settings/academic-years/:id` | Get year |
| `POST` | `/api/admin/settings/academic-years` | Create |
| `PATCH`| `/api/admin/settings/academic-years/:id` | Update |
| `POST` | `/api/admin/settings/academic-years/:id/activate` | Set as active year |

---

### Templates

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/settings/templates` | List templates (filter: `type`) |
| `GET`  | `/api/admin/settings/templates/:id` | Get template |
| `POST` | `/api/admin/settings/templates` | Create template |
| `PATCH`| `/api/admin/settings/templates/:id` | Update template |
| `POST` | `/api/admin/settings/templates/:id/publish` | Publish a version |
| `DELETE`| `/api/admin/settings/templates/:id` | Delete template |

---

### Dashboard

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/dashboard` | Tenant dashboard (students, staff, admissions counts) |
| `GET`  | `/api/platform/stats` | Super admin: all tenants stats |
| `GET`  | `/api/platform/dashboard` | Super admin: overview |

---

### Platform Admin (Super Admin only)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/platform/tenants` | List all tenants |
| `GET`  | `/api/platform/tenants/:id` | Get tenant |
| `POST` | `/api/platform/tenants` | Create tenant |
| `PATCH`| `/api/platform/tenants/:id` | Update tenant |
| `DELETE`| `/api/platform/tenants/:id` | Deactivate tenant |
| `PATCH`| `/api/platform/tenants/:id/features` | Set feature flags for tenant |
| `GET`  | `/api/platform/audit-logs` | Platform audit log |
| `GET`  | `/api/platform/audit-logs/:id` | Single audit log entry |

---

### Audit Logs

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/audit-logs` | Tenant audit log (filter: `entityType`, `profileId`) |

**Query params:** `limit` (max 200), `offset`

---

## 11. API — Comms

**Base path:** `/api/admin` (REST) | AppSync resolvers

### Announcements

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/communication/announcements` | List (filter: `status`, `targetGroup`) |
| `GET`  | `/api/admin/communication/announcements/:id` | Get announcement |
| `POST` | `/api/admin/communication/announcements` | Create (can set `publishNow: true`) |
| `PATCH`| `/api/admin/communication/announcements/:id` | Update |
| `POST` | `/api/admin/communication/announcements/:id/publish` | Publish draft |
| `POST` | `/api/admin/communication/announcements/:id/archive` | Archive |
| `DELETE`| `/api/admin/communication/announcements/:id` | Delete |

**Create body:**
```json
{
  "title": "Exam Schedule Released",
  "content": "The semester exam schedule has been posted...",
  "targetGroups": ["STUDENTS", "PARENTS"],
  "publishNow": true
}
```

---

### Events

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/events` | List events (query: `upcoming=true`, `campusId`) |
| `GET`  | `/api/admin/events/:id` | Get event |
| `POST` | `/api/admin/events` | Create event |
| `PATCH`| `/api/admin/events/:id` | Update event |
| `DELETE`| `/api/admin/events/:id` | Delete event |

**Create body:**
```json
{
  "title": "Annual Sports Day",
  "description": "...",
  "startDate": "2025-12-10T09:00:00Z",
  "endDate": "2025-12-10T17:00:00Z",
  "venue": "College Ground",
  "campusId": "..."
}
```

---

### Leave Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/leave` | List leave requests (admins see all; staff see own) |
| `GET`  | `/api/admin/leave/:id` | Get leave request |
| `POST` | `/api/admin/leave` | Submit leave request |
| `PATCH`| `/api/admin/leave/:id` | Update own PENDING request |
| `POST` | `/api/admin/leave/:id/approve` | Approve (admin only) |
| `POST` | `/api/admin/leave/:id/reject` | Reject (admin only) |
| `POST` | `/api/admin/leave/:id/cancel` | Cancel own leave |
| `DELETE`| `/api/admin/leave/:id` | Delete (admin only) |

**Submit body:**
```json
{
  "leaveType": "CASUAL",
  "fromDate": "2025-07-14",
  "toDate": "2025-07-15",
  "reason": "Family function"
}
```

**Approve/Reject body:**
```json
{ "remarks": "Approved. Ensure handover." }
```

**Leave types:** `CASUAL`, `SICK`, `EARNED`, `UNPAID`, `MATERNITY`, `PATERNITY`, `COMPENSATORY`

---

## 12. API — Results (Public)

### Public result lookup (no auth)

### GET /api/public/results/:token
Retrieve a published result batch by its public token.

**Response:** Full result batch document (only if `status === 'PUBLISHED'`)

```json
{
  "_id": "...",
  "title": "Semester 1 Results 2025",
  "description": "...",
  "examId": "...",
  "academicYearId": "...",
  "status": "PUBLISHED",
  "publishedAt": "2025-12-20T10:00:00Z",
  "fileKey": "tenantId/results/sem1-2025.pdf"
}
```

---

### Admin — Result Batches (requires auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/admin/results` | List batches (filter: `status`, `academicYearId`, `examId`) |
| `GET`  | `/api/admin/results/:id` | Get batch |
| `GET`  | `/api/admin/results/:id/token` | Get public share token + URL |
| `POST` | `/api/admin/results` | Create batch |
| `PATCH`| `/api/admin/results/:id` | Update draft batch |
| `POST` | `/api/admin/results/:id/publish` | Publish (makes public link active) |
| `POST` | `/api/admin/results/:id/archive` | Archive |
| `DELETE`| `/api/admin/results/:id` | Delete draft batch |

**Create body:**
```json
{
  "title": "Semester 1 Results 2025",
  "description": "Results for all B.Tech year 1 students",
  "examId": "...",
  "academicYearId": "...",
  "campusId": "..."
}
```

**Public URL format:** `https://<APP_BASE_URL>/results/<publicToken>`

---

## 13. API — Storage

### POST (Mutation) — generateUploadUrl
Generate a presigned S3 URL for direct client upload. Requires auth.

**Input:**
```json
{
  "fileName": "marksheet.pdf",
  "contentType": "application/pdf",
  "folder": "applications"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/vebgenix-docs-dev/tenantId/applications/marksheet-uuid.pdf?...",
  "key": "tenantId/applications/marksheet-uuid.pdf",
  "expiresIn": 300
}
```

The client uploads the file directly to S3 using a `PUT` request to `uploadUrl`. No file data passes through Lambda.

---

### GET (Query) — generateDownloadUrl
Generate a presigned S3 download URL. Access enforced by tenant: the `key` must start with `<tenantId>/`.

**Input:**
```json
{ "key": "tenantId/applications/marksheet-uuid.pdf" }
```

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...",
  "expiresIn": 900
}
```

---

## 14. API — Admin Cleanup (Deduplication)

> **Requires auth.** All operations require `admin.cleanup.read` or `admin.cleanup.write` permission.

### Duplicate Reports

| Method | GraphQL Query | Description |
|--------|---------------|-------------|
| `GET`  | `getDuplicateReport` | Combined: enquiries + students + applications with duplicate phones |
| `GET`  | `getDuplicateEnquiryReport` | Duplicate enquiries grouped by phone and email |
| `GET`  | `getDuplicateStudentReport` | Duplicate students grouped by name+DOB and phone |

**getDuplicateEnquiryReport response:**
```json
{
  "byPhone": [{ "_id": "9876543210", "count": 3, "ids": ["...","...","..."], "names": ["Rahul","Rahul K","R. Sharma"] }],
  "byEmail": [{ "_id": "rahul@ex.com", "count": 2, "ids": ["...","..."], "names": ["Rahul","Rahul K"] }],
  "totalPhoneDuplicates": 5,
  "totalEmailDuplicates": 2
}
```

### Merge Operations

#### POST (Mutation) — mergeEnquiries / runDeduplication
Merge duplicate enquiries — keep one, delete the rest. Applications linked to merged IDs are re-pointed to the keeper.

```json
{
  "keepId": "<enquiry-id-to-keep>",
  "mergeIds": ["<dup1>", "<dup2>"]
}
```

**Response:** `{ "success": true, "keptId": "...", "deletedCount": 2 }`

#### POST (Mutation) — mergeStudents
Deactivate duplicate student records and mark them as merged.

```json
{
  "keepId": "<student-id-to-keep>",
  "mergeIds": ["<dup1>", "<dup2>"]
}
```

**Response:** `{ "success": true, "keptId": "...", "deactivatedCount": 2 }`

### Bulk Cleanup

#### DELETE (Mutation) — bulkDeleteInactiveEnquiries
Delete closed enquiries older than N days (default: 90).

```json
{ "daysOld": 90 }
```

**Response:** `{ "deletedCount": 47 }`

---

## 15. Async Workers

### Email Worker (SQS)
Triggered by EventBridge rules via SQS. Sends emails via SES.

**Events it listens for:**
- `StaffInvited` → welcome + credentials email
- `InvoiceCreated` → invoice notification to student/parent
- `PaymentReceived` → payment receipt email
- `EnquiryReceived` → acknowledgement to enquirer

### Jobs Worker (SQS)
Background processing:
- Student registration number generation
- Bulk assignment progress tracking
- Certificate generation (PDF via template)

---

## 16. Error Codes

All Lambda responses follow this error shape:

```json
{
  "__error": true,
  "code": "NOT_FOUND",
  "message": "Application not found",
  "statusCode": 404
}
```

| Code | HTTP | Description |
|------|------|-------------|
| `BAD_REQUEST` | 400 | Invalid input / missing required field |
| `UNAUTHORIZED` | 401 | No valid token provided |
| `FORBIDDEN` | 403 | Token valid but insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Duplicate resource (e.g., duplicate phone in enquiry) |
| `INTERNAL` | 500 | Unexpected server error |

---

## 17. Postman Collection

Import `postman/Vebgenix-API.postman_collection.json` and `postman/Vebgenix-Dev.postman_environment.json` into Postman.

**Environment variables:**

| Variable | Description |
|----------|-------------|
| `base_url` | `http://localhost:5000` (dev) or AppSync URL |
| `cognito_region` | e.g. `ap-south-1` |
| `cognito_client_id` | Cognito App Client ID |
| `access_token` | Set automatically after login |
| `refresh_token` | Set automatically after login |
| `id_token` | Set automatically after login |
| `tenant_id` | Set to your tenant's `_id` |

**Login test script** (auto-saves tokens):
```js
const body = pm.response.json();
if (body.AuthenticationResult) {
  pm.environment.set('access_token',  body.AuthenticationResult.AccessToken);
  pm.environment.set('refresh_token', body.AuthenticationResult.RefreshToken);
  pm.environment.set('id_token',      body.AuthenticationResult.IdToken);
}
pm.expect(pm.response.code).to.be.oneOf([200]);
```

---

## Permissions Reference

Permissions are checked via `authorize(ctx, 'domain.resource.action')`.

| Permission | Who has it | Description |
|-----------|-----------|-------------|
| `admissions.enquiry.read` | ADMIN, ADMISSIONS_OFFICER | View enquiries |
| `admissions.enquiry.create` | ADMIN, ADMISSIONS_OFFICER | Create enquiries |
| `admissions.application.review` | ADMIN, ADMISSIONS_OFFICER | Review applications |
| `admissions.application.approve` | ADMIN | Approve/reject applications |
| `finance.fee_head.read` | ADMIN, FINANCE_MANAGER | View fee heads |
| `finance.invoice.read` | ADMIN, FINANCE_MANAGER, CASHIER | View invoices |
| `finance.payment.create` | ADMIN, FINANCE_MANAGER, CASHIER | Record payments |
| `finance.reports.read` | ADMIN, FINANCE_MANAGER | View financial reports |
| `academics.results.publish` | ADMIN, PRINCIPAL | Publish exam results |
| `identity.users.update` | ADMIN | Manage user profiles |
| `identity.roles.assign` | ADMIN | Assign roles |
| `comms.leave.approve` | ADMIN, HR_MANAGER | Approve leave |
| `settings.programs.create` | ADMIN | Manage programs |
| `tenant.settings.update` | ADMIN | Update tenant settings |
