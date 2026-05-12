# Vebgenix Backend — Complete API Reference

> **Product:** Vebgenix — Multi-tenant SaaS ERP for schools and colleges  
> **Architecture:** AWS Lambda + AppSync GraphQL + MongoDB Atlas  
> **Auth:** AWS Cognito (ID token, no Bearer prefix on AppSync)  
> **Last updated:** 2026-05-05

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Multi-Tenancy](#3-multi-tenancy)
4. [Environment Variables](#4-environment-variables)
5. [API — Settings](#5-api--settings)
6. [API — Identity](#6-api--identity)
7. [API — Admissions](#7-api--admissions)
8. [API — Finance](#8-api--finance)
9. [API — Academics](#9-api--academics)
10. [API — Promotions](#10-api--promotions)
11. [API — Communications](#11-api--communications)
12. [API — Storage](#12-api--storage)
13. [API — Results (Public)](#13-api--results-public)
14. [API — Audit & Cleanup](#14-api--audit--cleanup)
15. [Async Workers](#15-async-workers)
16. [Error Handling](#16-error-handling)
17. [Permissions Reference](#17-permissions-reference)
18. [Postman Collection](#18-postman-collection)
19. [End-to-End Workflow](#19-end-to-end-workflow)

---

## 1. Architecture Overview

```
Browser / Mobile App
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  CloudFront  (CDN + WAF)                                     │
└──────────────────────────────────────────────────────────────┘
       │
   ┌───┴───────────────────────┐
   │                           │
   ▼                           ▼
AppSync GraphQL API        API Gateway REST
(Cognito User Pool         (Bearer token via JWKS)
 Authorizer)
   │                           │
   └────────────┬──────────────┘
                │
                ▼
      Lambda Resolvers (one per domain)
      ┌─────────────────────────────────────────────┐
      │ identity    admissions    finance            │
      │ academics   settings      comms              │
      │ storage     results       admin-cleanup      │
      └─────────────────────────────────────────────┘
                │
                ▼
      MongoDB Atlas  (tenantId on every document)
                │
                ▼
      EventBridge → SQS → Workers (email, background jobs)
```

**Key points:**
- AppSync verifies Cognito tokens — Lambda receives trusted `event.identity.claims`
- All Lambdas share the `@vebgenix/db` package (one Mongoose connection pool per container)
- Every DB document carries `tenantId` — cross-tenant access is blocked at the application layer
- Errors are thrown (not returned) — AppSync formats them as `{ errors: [{ message, extensions }] }`

---

## 2. Authentication

### Get a token (Cognito)

```
POST https://cognito-idp.<region>.amazonaws.com/
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth
Content-Type: application/x-amz-json-1.1

{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "<COGNITO_CLIENT_ID>",
  "AuthParameters": {
    "USERNAME": "admin@school.com",
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

### Refresh token

```json
{
  "AuthFlow": "REFRESH_TOKEN_AUTH",
  "ClientId": "<COGNITO_CLIENT_ID>",
  "AuthParameters": { "REFRESH_TOKEN": "<refresh_token>" }
}
```

### Request headers (AppSync / GraphQL)

```
Authorization: <IdToken>          ← No "Bearer" prefix — AppSync specific
Content-Type: application/json
x-tenant-id: <tenantId>           ← Required for all tenant-scoped requests
```

### Request headers (REST — API Gateway)

```
Authorization: Bearer <AccessToken>
Content-Type: application/json
x-tenant-id: <tenantId>
```

### GraphQL request shape

All AppSync requests are `POST` to `https://<appsync_url>/graphql`:

```json
{
  "query": "mutation EnrollStudent($input: EnrollStudentInput!) { enrollStudent(input: $input) }",
  "variables": { "input": "<stringified-JSON>" }
}
```

> **Note:** AppSync scalar `typed input` means the `input` variable value must be a **JSON string**, not an object.

---

## 3. Multi-Tenancy

1. Cognito token carries `custom:tenantId` (set at user creation)
2. Lambda extracts it from claims (AppSync) or `x-tenant-id` header (REST)
3. Every MongoDB query includes `{ tenantId }` filter
4. Compound indexes enforce tenant isolation at DB level

---

## 4. Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | Cognito App Client ID |
| `COGNITO_REGION` | AWS region (`ap-south-1`) |
| `RAZORPAY_KEY_ID` | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay HMAC secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret |
| `EVENT_BUS_NAME` | EventBridge bus name |
| `DOCUMENTS_BUCKET` | S3 bucket for uploads |
| `APP_BASE_URL` | Frontend base URL (public result links) |
| `STAGE` | `dev` or `prod` |

---

## 5. API — Settings

> **Required roles:** ADMIN, TENANT_ADMIN

### Academic Years

| Operation | GraphQL / REST | Description |
|-----------|---------------|-------------|
| `createAcademicYear` | `mutation CreateAcademicYear($input: CreateAcademicYearInput!)` | Create a new academic year |
| `setActiveAcademicYear` | `mutation SetActiveAcademicYear($id: ID!)` | Mark as active; deactivates all others |
| `listAcademicYears` | `query { listAcademicYears { id name startDate endDate isActive } }` | List all years for tenant |
| `getAcademicYear` | `query GetAcademicYear($id: ID!)` | Get single year |
| `updateAcademicYear` | `mutation UpdateAcademicYear($id: ID!, $input: typed input!)` | Update year fields |

**Create input:**
```json
{
  "name": "2025-26",
  "startDate": "2025-06-01",
  "endDate": "2026-05-31"
}
```

**Response:**
```json
{
  "id": "683804abc123...",
  "name": "2025-26",
  "startDate": "2025-06-01",
  "endDate": "2026-05-31",
  "isActive": false
}
```

---

### Campuses

| Operation | Description |
|-----------|-------------|
| `createCampus(input: typed input!)` | Create campus — returns `{ id, name, code, type, isActive }` |
| `listCampuses` | List active campuses |
| `getCampus(id: ID!)` | Get single campus |
| `updateCampus(id: ID!, input: typed input!)` | Update campus fields |
| `deactivateCampus(id: ID!)` | Soft-delete campus |

**Create input:**
```json
{
  "name": "Main Campus",
  "code": "MAIN",
  "type": "SCHOOL"
}
```

**Campus types:** `SCHOOL` `PU` `DEGREE` `POLYTECHNIC` `OTHER`

---

### Programs

| Operation | Description |
|-----------|-------------|
| `createProgram(input: typed input!)` | Create program — returns `{ id, name, code, type }` |
| `listPrograms` | List all programs |
| `getProgram(id: ID!)` | Get single program |
| `updateProgram(id: ID!, input: typed input!)` | Update |
| `deleteProgram(id: ID!)` | Soft-delete |

**Create input:**
```json
{
  "name": "School Program",
  "code": "SCH",
  "type": "SCHOOL",
  "durationYears": 12
}
```

**Program types:** `DEGREE` `DIPLOMA` `CERTIFICATE` `PG` `PHD` `SCHOOL`

---

### Tenant Features

| Operation | Description |
|-----------|-------------|
| `getTenantFeatures` | Get feature flags for tenant |
| `updateTenantFeatures(input: typed input!)` | Enable/disable modules |

**Input:**
```json
{
  "admissions": true,
  "finance": true,
  "academics": true,
  "communications": true,
  "timetable": false
}
```

---

### Dashboard

| Operation | Description |
|-----------|-------------|
| `dashboardOverview` | Tenant-level stats (students, staff, fees collected) |
| `listAuditLogs(limit: Int)` | Tenant audit trail |
| `listTemplates` | Certificate/document templates |

---

## 6. API — Identity

> **Required roles:** ADMIN, TENANT_ADMIN

### Current user

```graphql
query { me }
```

**Response:**
```json
{
  "userId": "...",
  "email": "admin@school.com",
  "firstName": "Dhanush",
  "lastName": "AG",
  "personaRole": "ADMIN",
  "membership": {
    "tenantId": "...",
    "campusId": "...",
    "role": "ADMIN"
  },
  "isActive": true
}
```

---

### Users

| Operation | Description |
|-----------|-------------|
| `listUsers` | List all staff/admin users |
| `getUser(id: ID!)` | Get user by ID |
| `inviteStaff(input: typed input!)` | Invite staff — sends Cognito invite email |
| `updateUser(id: ID!, input: typed input!)` | Update user fields |
| `deactivateUser(id: ID!)` | Soft-deactivate |

**Invite staff input:**
```json
{
  "email": "teacher@school.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "TEACHER",
  "campusId": "<campus_id>"
}
```

---

## 7. API — Admissions

> **Required roles:** ADMIN, ADMISSIONS_OFFICER

### Enquiries

| Operation | Description |
|-----------|-------------|
| `createEnquiry(input: typed input!)` | Log a new admission enquiry |
| `listEnquiries` | List enquiries (filter: `status`, `campusId`) |
| `updateEnquiry(id: ID!, input: typed input!)` | Update enquiry status |

**Create input:**
```json
{
  "studentName": "Rahul Sharma",
  "phone": "9876543210",
  "email": "rahul@example.com",
  "campusId": "<campus_id>",
  "academicYearId": "<academic_year_id>",
  "source": "WALK_IN",
  "notes": "Interested in Grade 10"
}
```

**Sources:** `WALK_IN` `PHONE` `EMAIL` `WEBSITE` `REFERRAL` `SOCIAL_MEDIA`

---

### Applications

| Operation | Description |
|-----------|-------------|
| `listApplications` | List applications (filter: `status`, `academicYearId`) |
| `getApplication(id: ID!)` | Get single application |
| `createApplication(input: typed input!)` | Create application from enquiry |
| `reviewApplication(id: ID!, input: typed input!)` | Move to UNDER_REVIEW |
| `approveApplication(id: ID!)` | Approve — enables `convertApplicationToStudent` |
| `rejectApplication(id: ID!, reason: String)` | Reject |
| `admissionsStats` | Stats: total enquiries, applications, admissions by month |

**Application statuses:** `ENQUIRY` → `UNDER_REVIEW` → `APPROVED` → `ENROLLED` or `REJECTED`

---

## 8. API — Finance

> **Required roles:** ADMIN, FINANCE_MANAGER, CASHIER (payments only)

### Fee Categories

Fee categories group fee heads and define invoice/receipt number prefixes.

| Operation | Description |
|-----------|-------------|
| `createFeeCategory(input: typed input!)` | Create category |
| `getFeeCategory(id: ID!)` | Get single |
| `updateFeeCategory(id: ID!, input: typed input!)` | Update |
| `listFeeCategories` | List all |
| `deleteFeeCategory(id: ID!)` | Delete |

**Create input:**
```json
{
  "name": "General Fees",
  "moduleType": "FEE",
  "feeType": "GENERAL",
  "invoicePrefix": "GF/INV",
  "receiptPrefix": "GF/REC",
  "defaultAllocationMethod": "PRO_RATA"
}
```

**Allocation methods:** `PRO_RATA` `PRIORITY_WISE` `MANUAL`
**Fee types:** `GENERAL` `EXAM` `ADMISSION` `TRANSPORT` `HOSTEL` `MISC`

---

### Fee Heads

Fee heads are individual chargeable line items (Tuition Fee, Lab Fee, etc.).

| Operation | Description |
|-----------|-------------|
| `createFeeHead(input: typed input!)` | Create fee head |
| `updateFeeHead(id: ID!, input: typed input!)` | Update |
| `listFeeHeads` | List all (filter: `feeCategoryId`, `isActive`) |
| `deleteFeeHead(id: ID!)` | Delete |

**Create input:**
```json
{
  "name": "Tuition Fee",
  "prefix": "TF",
  "type": "RECURRING",
  "feeCategoryId": "<fee_category_id>",
  "isMandatory": true,
  "isRefundable": false,
  "priorityOrder": 1
}
```

**Types:** `RECURRING` `ONE_TIME` `OPTIONAL`

---

### Fee Schedules

Fee schedules define payment installment plans.

| Operation | Description |
|-----------|-------------|
| `createFeeSchedule(input: typed input!)` | Create schedule with slots |
| `updateFeeSchedule(id: ID!, input: typed input!)` | Update |
| `listFeeSchedules` | List all |
| `deleteFeeSchedule(id: ID!)` | Delete |

**Create input:**
```json
{
  "name": "Annual Plan 2025-26",
  "academicYearId": "<academic_year_id>",
  "campusId": "<campus_id>",
  "feeCategoryId": "<fee_category_id>",
  "collectionType": "PARTIAL_ALLOWED",
  "allowPartialPayment": true,
  "graceDays": 5,
  "slots": [
    { "name": "Term 1", "dueDate": "2025-07-31", "percentOfTotal": 50 },
    { "name": "Term 2", "dueDate": "2025-12-31", "percentOfTotal": 50 }
  ]
}
```

**Collection types:** `FULL_ONLY` `PARTIAL_ALLOWED` `PARTIAL_WITH_MINIMUM_AMOUNT` `PARTIAL_WITH_MINIMUM_PERCENTAGE`

---

### Fee Structures

A fee structure is the master template of fees for a class in an academic year.

| Operation | Description |
|-----------|-------------|
| `createFeeStructure(input: typed input!)` | Create structure |
| `getFeeStructure(id: ID!)` | Get single |
| `updateFeeStructure(id: ID!, input: typed input!)` | Update |
| `listFeeStructures(academicYearId: ID)` | List all |
| `copyFeePattern(input: typed input!)` | Copy last year's structures to new year |
| `deleteFeeStructure(id: ID!)` | Delete |

**Create input:**
```json
{
  "name": "Grade 10 Annual Fee 2025-26",
  "campusId": "<campus_id>",
  "academicYearId": "<academic_year_id>",
  "classId": "<class_id>",
  "feeCategoryId": "<fee_category_id>",
  "feeScheduleId": "<fee_schedule_id>",
  "allocationMethod": "PRO_RATA",
  "components": [
    {
      "feeHeadId": "<fee_head_id>",
      "feeHeadName": "Tuition Fee",
      "amount": 50000,
      "isOptional": false,
      "priorityOrder": 1
    },
    {
      "feeHeadId": "<lab_fee_head_id>",
      "feeHeadName": "Lab Fee",
      "amount": 5000,
      "isOptional": false,
      "priorityOrder": 2
    }
  ]
}
```

**Copy pattern input:**
```json
{
  "fromAcademicYearId": "<current_year_id>",
  "toAcademicYearId": "<next_year_id>",
  "campusId": "<campus_id>"
}
```

---

### Fee Assignments

Assigning a fee structure to a student generates invoices for that student.

| Operation | Description |
|-----------|-------------|
| `getFeeAssignmentQueue(academicYearId: ID!, campusId: ID)` | Students without fee assignment yet |
| `createFeeAssignment(input: typed input!)` | Assign fee structure to one student — creates invoice |
| `bulkAssignFeeStructure(input: typed input!)` | Assign to all students in a class at once |
| `getStudentFeeAssignment(studentId: ID!, academicYearId: ID!)` | Student's current assignment |
| `listFeeAssignments(academicYearId: ID)` | List all assignments |
| `getFeeAssignment(id: ID!)` | Get single |

**Assign single student input:**
```json
{
  "studentId": "<student_id>",
  "feeStructureId": "<fee_structure_id>",
  "academicYearId": "<academic_year_id>",
  "campusId": "<campus_id>",
  "discountAmount": 5000,
  "discountReason": "Merit scholarship"
}
```

**Bulk assign input:**
```json
{
  "feeStructureId": "<fee_structure_id>",
  "academicYearId": "<academic_year_id>",
  "campusId": "<campus_id>",
  "classId": "<class_id>"
}
```

**Bulk assign response:**
```json
{ "succeeded": 42, "failed": 0, "total": 42 }
```

> Assigning a fee structure automatically generates an Invoice with status `PENDING`.

---

### Invoices

| Operation | Description |
|-----------|-------------|
| `getStudentInvoices(studentId: ID!)` | All invoices for a student |
| `listInvoices(academicYearId: ID)` | List (filter: `studentId`, `status`, `campusId`) |
| `getInvoice(id: ID!)` | Get single invoice |
| `getStudentDues(studentId: ID!)` | Outstanding unpaid invoices + total due |
| `createOneOffCharge(input: typed input!)` | Create a one-time ad-hoc charge |
| `reviseInvoice(id: ID!, input: typed input!)` | Revise invoice amount (creates audit trail) |
| `cancelInvoice(id: ID!, reason: String)` | Cancel invoice |
| `getFeeRevisions(id: ID!)` | Revision history for an invoice |

**Invoice response:**
```json
{
  "id": "...",
  "invoiceNumber": "GF_25-26_ORD_000001",
  "studentId": "...",
  "status": "PENDING",
  "totalAmount": 55000,
  "concessionAmount": 5000,
  "netAmount": 50000,
  "paidAmount": 0,
  "dueAmount": 50000,
  "dueDate": "2025-07-31",
  "items": [
    {
      "feeHeadId": "...",
      "feeHeadName": "Tuition Fee",
      "amount": 50000,
      "netAmount": 45000,
      "paidAmount": 0,
      "balanceAmount": 45000
    }
  ]
}
```

**Invoice statuses:** `PENDING` → `PARTIALLY_PAID` → `PAID` (or `CANCELLED` / `OVERDUE`)

**One-off charge input:**
```json
{
  "studentId": "<student_id>",
  "campusId": "<campus_id>",
  "academicYearId": "<academic_year_id>",
  "classId": "<class_id>",
  "amount": 500,
  "description": "Library fine",
  "feeHeadId": "<fee_head_id>",
  "feeHeadName": "Tuition Fee"
}
```

**Revise input:**
```json
{ "newAmount": 48000, "reason": "Scholarship discount applied" }
```

---

### Payments

| Operation | Description |
|-----------|-------------|
| `recordPayment(input: typed input!)` | Record offline payment (CASH / CHEQUE / UPI) |
| `collectPaymentByStudent(studentId: ID!, input: typed input!)` | Collect across all outstanding invoices (oldest-first) |
| `createPaymentOrder(input: typed input!)` | Create Razorpay order for online payment |
| `verifyPaymentSignature(input: typed input!)` | Verify Razorpay signature after client payment |
| `listPayments(studentId: ID)` | List payments |
| `getPayment(id: ID!)` | Get single payment |
| `listReceipts(studentId: ID)` | List successful payments with receipts |
| `getReceipt(id: ID!)` | Get receipt |
| `listPaymentAllocations(paymentId: ID!)` | See how a payment was allocated to fee heads |

**Record offline payment input:**
```json
{
  "invoiceId": "<invoice_id>",
  "studentId": "<student_id>",
  "campusId": "<campus_id>",
  "amount": 25000,
  "method": "CASH",
  "remarks": "Term 1 payment",
  "referenceNumber": ""
}
```

**Payment methods:** `CASH` `CHEQUE` `BANK_TRANSFER` `UPI` `CARD` `ONLINE`

**Collect by student input** (splits across all outstanding invoices oldest-first):
```json
{
  "amount": 50000,
  "method": "CASH",
  "remarks": "Annual fee collection"
}
```

**Collect response:**
```json
{
  "payments": [...],
  "totalCollected": 50000,
  "remainingAmount": 0
}
```

**Create Razorpay order input:**
```json
{ "invoiceId": "<invoice_id>", "amount": 25000 }
```

**Create Razorpay order response:**
```json
{
  "orderId": "order_XXXXXXXX",
  "amount": 2500000,
  "currency": "INR",
  "paymentId": "<pre-created-payment-doc-id>"
}
```

**Verify signature input:**
```json
{
  "razorpayOrderId": "order_XXXXXXXX",
  "razorpayPaymentId": "pay_XXXXXXXX",
  "razorpaySignature": "hmac_sha256_signature"
}
```

**Payment recording response:**
```json
{
  "payment": {
    "_id": "...",
    "amount": 25000,
    "method": "CASH",
    "status": "SUCCESS",
    "receiptNumber": "GF/REC-000001",
    "paidAt": "2025-07-05T10:30:00Z"
  }
}
```

---

### Reports

| Operation | Description |
|-----------|-------------|
| `dayBook(from: String, to: String, campusId: ID)` | All payments for a date or range |
| `feeCollectionAnalytics(academicYearId: ID!, campusId: ID)` | Monthly collection summary |

---

## 9. API — Academics

> **Required roles:** ADMIN, ACADEMIC_MANAGER

### Classes

| Operation | Description |
|-----------|-------------|
| `createClass(input: typed input!)` | Create a class/grade |
| `listClasses(academicYearId: ID)` | List classes |
| `getClass(id: ID!)` | Get single class |
| `updateClass(id: ID!, input: typed input!)` | Update class |
| `deleteClass(id: ID!)` | Delete |

**Create input:**
```json
{
  "name": "Grade 10",
  "code": "G10",
  "campusId": "<campus_id>",
  "academicYearId": "<academic_year_id>",
  "programId": "<program_id>"
}
```

---

### Sections

| Operation | Description |
|-----------|-------------|
| `createSection(classId: ID!, input: typed input!)` | Create a section under a class |
| `listAllSections(classId: ID, academicYearId: ID)` | List sections (filter by class or year) |
| `getSection(id: ID!)` | Get single section |
| `updateSection(id: ID!, input: typed input!)` | Update section |
| `deleteSection(id: ID!)` | Soft-delete section |
| `setSectionIncharge(sectionId: ID!, input: typed input!)` | Assign class teacher |
| `listSectionStudents(sectionId: ID!)` | Students currently in section |

**Create input:**
```json
{
  "name": "A",
  "academicYearId": "<academic_year_id>",
  "campusId": "<campus_id>",
  "capacity": 40
}
```

---

### Students

| Operation | Description |
|-----------|-------------|
| `enrollStudent(input: typed input!)` | Enroll new student (creates Student + Enrollment) |
| `convertApplicationToStudent(input: typed input!)` | Convert approved admission application |
| `getStudent(id: ID!)` | Get student |
| `updateStudent(studentId: ID!, input: typed input!)` | Update student details |
| `updateStudentStatus(studentId: ID!, status: String!)` | Change status |
| `assignStudentClass(studentId: ID!, input: typed input!)` | Assign to class and/or section |
| `listStudents` | List students (filter: `campusId`, `classId`, `sectionId`, `status`) |
| `enableStudentPortal(studentId: ID!)` | Create Cognito account for student self-access |
| `enableGuardianPortal(studentId: ID!, input: typed input!)` | Create Cognito account for guardian |

**Enroll input:**
```json
{
  "firstName": "Arjun",
  "lastName": "Kumar",
  "dateOfBirth": "2010-03-15",
  "gender": "MALE",
  "phone": "9876543210",
  "email": "arjun.k@example.com",
  "campusId": "<campus_id>",
  "academicYearId": "<academic_year_id>",
  "classId": "<class_id>",
  "sectionId": "<section_id>",
  "guardians": [
    {
      "name": "Ravi Kumar",
      "relation": "Father",
      "phone": "9876543211",
      "email": "ravi@example.com"
    }
  ]
}
```

**Enroll response:**
```json
{
  "id": "...",
  "admissionNo": "ADM-2025-001",
  "registrationNumber": "REG-G10-25-26-001",
  "firstName": "Arjun",
  "lastName": "Kumar",
  "status": "ACTIVE",
  "classId": "...",
  "sectionId": "...",
  "academicYearId": "..."
}
```

**Student statuses:** `ACTIVE` `INACTIVE` `GRADUATED` `TRANSFERRED` `DROPPED`

**Assign to class input:**
```json
{
  "classId": "<class_id>",
  "sectionId": "<section_id>",
  "academicYearId": "<academic_year_id>"
}
```

> **Duplicate detection:** If a student with the same phone/email or same name+DOB exists, the API returns a `CONFLICT` error. Pass `"force": true` inside input to override.

---

### Attendance

| Operation | Description |
|-----------|-------------|
| `markSectionAttendance(input: BulkAttendanceInput!)` | Mark attendance for all students in a section |
| `getSectionAttendance(sectionId: ID!, date: AWSDate!)` | Get attendance for a section on a date |
| `getSectionAttendanceSummary(sectionId: ID!, from: AWSDate!, to: AWSDate!)` | Summary report |
| `getStudentAttendance(studentId: ID!, from: AWSDate!, to: AWSDate!)` | Student attendance history |

**Mark attendance input:**
```json
{
  "sectionId": "<section_id>",
  "date": "2025-07-15",
  "records": [
    { "studentId": "<student_id>", "status": "PRESENT" },
    { "studentId": "<student_id_2>", "status": "ABSENT" },
    { "studentId": "<student_id_3>", "status": "LATE" }
  ]
}
```

**Attendance statuses:** `PRESENT` `ABSENT` `LATE` `EXCUSED` `HOLIDAY`

---

### Exams & Results

| Operation | Description |
|-----------|-------------|
| `createExam(input: typed input!)` | Create exam definition |
| `listExams(academicYearId: ID)` | List exams |
| `getExam(id: ID!)` | Get exam |
| `publishResults(examId: ID!)` | Publish results (makes them visible to students) |
| `listResults(examId: ID!)` | List all result entries for exam |

**Create exam input:**
```json
{
  "name": "Term 1 Exam 2025",
  "classId": "<class_id>",
  "sectionId": "<section_id>",
  "academicYearId": "<academic_year_id>",
  "campusId": "<campus_id>",
  "date": "2025-10-15",
  "maxMarks": 100
}
```

---

### Timetable

| Operation | Description |
|-----------|-------------|
| `getSectionTimetable(sectionId: ID!)` | Section weekly timetable |
| `getTeacherTimetable(teacherId: ID!)` | Teacher's schedule |
| `getTeacherWorkload(teacherId: ID!)` | Weekly periods count |
| `replaceSectionTimetable(sectionId: ID!, slots: [TimetableSlotInput!]!)` | Replace entire timetable |

**Slot input:**
```json
{
  "dayOfWeek": "MONDAY",
  "periodNumber": 1,
  "startTime": "09:00",
  "endTime": "09:50",
  "subjectId": "<subject_id>",
  "teacherId": "<teacher_id>"
}
```

---

### Certificates

| Operation | Description |
|-----------|-------------|
| `listCertificates` | List certificate requests |
| `issueCertificate(input: typed input!)` | Request a certificate |
| `approveCertificate(id: ID!)` | Approve and issue |

**Issue input:**
```json
{
  "studentId": "<student_id>",
  "type": "BONAFIDE",
  "reason": "Bank loan application"
}
```

**Certificate types:** `BONAFIDE` `TRANSFER` `CHARACTER` `CONDUCT` `MIGRATION`

---

## 10. API — Promotions

> **Required permissions:** `academics.promotion.create` / `academics.promotion.read`

Promotions move students from one academic year + grade to the next, with configurable section assignment strategies and automatic fee handling.

### Operations

| Operation | Description |
|-----------|-------------|
| `setStudentPromotionEligibility(input: typed input!)` | Mark students ELIGIBLE / DETAINED / ON_HOLD before promoting |
| `promoteStudents(input: typed input!)` | Run batch promotion (returns batch with per-student results) |
| `listPromotionBatches(fromAcademicYearId: ID)` | List promotion batches |
| `getPromotionBatch(id: ID!)` | Get batch details |
| `listPromotionBatchItems(id: ID!)` | Individual student results within a batch |

---

### Set Promotion Eligibility

Sets eligibility status on each student's current-year enrollment. Must be done before promoting if using `USE_ENROLLMENT_ELIGIBILITY` mode.

```json
{
  "academicYearId": "<current_academic_year_id>",
  "updates": [
    { "studentId": "<student_id_1>", "eligibility": "ELIGIBLE" },
    { "studentId": "<student_id_2>", "eligibility": "DETAINED" },
    { "studentId": "<student_id_3>", "eligibility": "ON_HOLD" }
  ]
}
```

**Response:** `{ "updated": 3 }`

**Eligibility values:** `ELIGIBLE` `DETAINED` `ON_HOLD`

---

### Promote Students

The main promotion operation. Creates a `PromotionBatch` and per-student `PromotionBatchItem` records.

**Input:**
```json
{
  "fromAcademicYearId": "<current_year_id>",
  "toAcademicYearId": "<next_year_id>",
  "campusId": "<campus_id>",
  "fromGradeId": "<current_class_id>",
  "toGradeId": "<next_class_id>",
  "studentIds": ["<student_id_1>", "<student_id_2>"],

  "sectionStrategy": "SAME_SECTION",

  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",

  "feeAction": "ASSIGN_EXISTING",
  "feeStructureId": "<next_year_fee_structure_id>",
  "allowPendingFee": false
}
```

**Response:**
```json
{
  "batch": {
    "id": "...",
    "status": "COMPLETED",
    "fromAcademicYearId": "...",
    "toAcademicYearId": "...",
    "sectionStrategy": "SAME_SECTION",
    "feeAction": "ASSIGN_EXISTING",
    "totalStudents": 2
  },
  "promotedCount": 2,
  "detainedCount": 0,
  "skippedCount": 0,
  "failedCount": 0
}
```

---

### Section Strategies

| Strategy | Required extra fields | Behaviour |
|----------|-----------------------|-----------|
| `SAME_SECTION` | — | Student goes to section with same name in new grade |
| `MANUAL` | `sectionAssignments: [{studentId, sectionId}]` | Explicit per-student assignment |
| `AUTO_SHUFFLE` | `targetSectionIds: [...]` | Round-robin across target sections |
| `GENDER_BALANCE` | `targetSectionIds: [...]` | Interleaves M/F before round-robin |
| `CAPACITY_LIMIT` | `targetSectionIds: [...]`, `maxStudentsPerSection: 40` | Fills sections up to max capacity |
| `PERFORMANCE_RANK` | `targetSectionIds: [...]`, `rankByExamId: "..."` | Ranked by exam marks, then round-robin |
| `SUBJECT_GROUP` | `subjectGroupSectionMap: [{subjectGroupId, sectionId}]`, `targetSectionIds` | Groups into sections by elective stream |
| `TRANSPORT_ROUTE` | `transportRouteSectionMap: [{transportRouteId, sectionId}]`, `targetSectionIds` | Groups by bus route |
| `EXCEL_IMPORT` | `sectionAssignments: [{studentId, sectionId}]` | Uploaded import (same as MANUAL) |

---

### Fee Actions

| `feeAction` | Behaviour |
|-------------|-----------|
| `SKIP` | No fee assignment; student must be assigned manually later |
| `ASSIGN_EXISTING` | Assign existing fee structure(s) matching `toAcademicYearId` + `toGradeId`. Provide `feeStructureId` or `feeStructureIds` for explicit selection |
| `COPY_PATTERN` | Copies fee structures and schedules from `fromAcademicYearId`/`fromGradeId` into the new year, then assigns the copies |

---

### Eligibility Modes

| `eligibilityMode` | Behaviour |
|-------------------|-----------|
| `USE_ENROLLMENT_ELIGIBILITY` (default) | `DETAINED` students are not promoted. `ON_HOLD` are skipped for manual review. `ELIGIBLE` or unset → promoted |
| `IGNORE_RESULTS` | All students in `studentIds` are promoted regardless of eligibility flags |

> Pass `"force": true` in the input to bypass both eligibility and pending-fee checks.

---

### Promotion Batch Statuses

`PROCESSING` → `COMPLETED` | `PARTIALLY_COMPLETED` | `FAILED`

---

### List Promotion Batch Items response

```json
[
  {
    "studentId": "...",
    "action": "PROMOTE",
    "fromGradeId": "...",
    "fromSectionId": "...",
    "toGradeId": "...",
    "toSectionId": "...",
    "feeAssignmentStatus": "ASSIGNED",
    "generatedInvoiceIds": ["..."],
    "remarks": null
  },
  {
    "studentId": "...",
    "action": "DETAIN",
    "feeAssignmentStatus": "SKIPPED",
    "generatedInvoiceIds": [],
    "remarks": "Result: DETAINED"
  }
]
```

**Item actions:** `PROMOTE` `DETAIN` `SKIP`
**Fee assignment statuses:** `PENDING` `ASSIGNED` `SKIPPED` `FAILED`

---

## 11. API — Communications

> **Required roles:** ADMIN, ACADEMIC_MANAGER

### Announcements

| Operation | Description |
|-----------|-------------|
| `createAnnouncement(input: typed input!)` | Create and optionally publish immediately |
| `listAnnouncements` | List announcements |

**Input:**
```json
{
  "title": "Exam Schedule Released",
  "content": "Semester exams begin October 15...",
  "campusId": "<campus_id>",
  "targetAudience": "ALL"
}
```

**Target audiences:** `ALL` `STUDENTS` `STAFF` `PARENTS`

---

### Events

| Operation | Description |
|-----------|-------------|
| `listEvents` | List events |
| `createEvent(input: typed input!)` | Create event |

---

### Leave Requests

| Operation | Description |
|-----------|-------------|
| `listLeaveRequests` | List leave requests (admin sees all, staff see own) |
| `submitLeaveRequest(input: typed input!)` | Submit leave |
| `approveLeaveRequest(id: ID!)` | Approve |
| `rejectLeaveRequest(id: ID!)` | Reject |

---

## 12. API — Storage

### Upload file

```graphql
mutation GenerateUploadUrl($input: GetUploadUrlInput!) { getUploadUrl(input: $input) }
```

**Input:**
```json
{
  "fileName": "marksheet.pdf",
  "contentType": "application/pdf",
  "folder": "documents"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/vebgenix-docs/tenantId/documents/uuid.pdf?...",
  "key": "tenantId/documents/uuid.pdf",
  "expiresIn": 300
}
```

> Client uploads directly to S3 using `PUT` to `uploadUrl`. No file data passes through Lambda.

---

### Download file

```graphql
mutation GenerateDownloadUrl($input: ID!) { getDownloadUrl(input: $input) }
```

**Input:** `{ "key": "tenantId/documents/uuid.pdf" }`
**Response:** `{ "downloadUrl": "https://s3...", "expiresIn": 900 }`

---

## 13. API — Results (Public)

### Public result lookup (no auth required)

```graphql
query GetPublicResult($token: String!) { getPublicResult(token: $token) }
```

Returns the published result batch for the given token.

---

### Admin — Result Batches

| Operation | Description |
|-----------|-------------|
| `createResultBatch(input: typed input!)` | Create draft result batch |
| `listResultBatches(academicYearId: ID)` | List batches |
| `publishResults(examId: ID!)` | Publish — activates public token |

**Create input:**
```json
{
  "examId": "<exam_id>",
  "classId": "<class_id>",
  "sectionId": "<section_id>",
  "academicYearId": "<academic_year_id>"
}
```

---

## 14. API — Audit & Cleanup

> **Required role:** ADMIN

### Audit Logs

```graphql
query { listAuditLogs(limit: 20) }
```

Returns recent admin actions with `entityType`, `entityId`, `action`, `profileId`, `timestamp`.

---

### Duplicate Reports

| Operation | Description |
|-----------|-------------|
| `getDuplicateStudentReport` | Students sharing same name+DOB or phone |
| `getDuplicateEnquiryReport` | Enquiries with duplicate phone/email |

---

### Merge

| Operation | Description |
|-----------|-------------|
| `mergeStudents(input: typed input!)` | Merge duplicates — keeps primary, deactivates others |

**Input:**
```json
{
  "primaryStudentId": "<keep_id>",
  "duplicateStudentIds": ["<dup1>", "<dup2>"]
}
```

---

## 15. Async Workers

### Email Worker (SQS via EventBridge)

Triggered events → SES email:

| Event | Email sent |
|-------|-----------|
| `StaffInvited` | Welcome email with temporary Cognito credentials |
| `InvoiceCreated` | Invoice notification to student/guardian |
| `PaymentReceived` | Payment receipt |
| `EnquiryReceived` | Acknowledgement to enquirer |
| `AnnouncementPublished` | Notification to target audience |

### Jobs Worker (SQS)

Background processing:
- Student registration number generation (sequential per class/section)
- Bulk class assignment progress tracking
- Certificate PDF generation from templates

---

## 16. Error Handling

Errors are thrown (not returned as `{ __error: true }`) so AppSync formats them correctly:

```json
{
  "errors": [
    {
      "message": "Application not found",
      "extensions": {
        "code": "NOT_FOUND"
      }
    }
  ],
  "data": null
}
```

| Error Code | HTTP | Meaning |
|------------|------|---------|
| `BAD_REQUEST` | 400 | Invalid input / missing required field |
| `UNAUTHORIZED` | 401 | No valid token |
| `FORBIDDEN` | 403 | Valid token but insufficient permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate — e.g., same student phone, duplicate fee assignment |
| `FEATURE_DISABLED` | 403 | Module disabled for this tenant |
| `INTERNAL` | 500 | Unexpected server error |

---

## 17. Permissions Reference

Permissions follow the pattern `domain.resource.action`.

| Permission | Roles with access | Description |
|------------|-------------------|-------------|
| `settings.academic_year.create` | ADMIN | Create academic years |
| `settings.academic_year.update` | ADMIN | Update / activate academic year |
| `tenant.campuses.create` | ADMIN | Create campuses |
| `admissions.enquiry.create` | ADMIN, ADMISSIONS_OFFICER | Log enquiries |
| `admissions.application.review` | ADMIN, ADMISSIONS_OFFICER | Review applications |
| `admissions.application.approve` | ADMIN | Approve/reject applications |
| `academics.sections.create` | ADMIN, ACADEMIC_MANAGER | Create sections |
| `academics.students.assign` | ADMIN, ACADEMIC_MANAGER | Assign student to class |
| `students.enroll` | ADMIN, ACADEMIC_MANAGER | Enroll new student |
| `students.status.update` | ADMIN | Change student status |
| `academics.promotion.create` | ADMIN, ACADEMIC_MANAGER | Run and manage promotions |
| `academics.promotion.read` | ADMIN, ACADEMIC_MANAGER, TEACHER | View promotion batches |
| `academics.results.publish` | ADMIN, PRINCIPAL | Publish exam results |
| `finance.fee_head.read` | ADMIN, FINANCE_MANAGER | View fee heads |
| `finance.fee_assignment.create` | ADMIN, FINANCE_MANAGER | Assign fee structures |
| `finance.fee_assignment.read` | ADMIN, FINANCE_MANAGER | View fee assignments |
| `finance.fee_pattern.copy` | ADMIN, FINANCE_MANAGER | Copy fee pattern to next year |
| `finance.invoice.read` | ADMIN, FINANCE_MANAGER, CASHIER | View invoices |
| `finance.invoice.create` | ADMIN, FINANCE_MANAGER | Create one-off charges |
| `finance.invoice.update` | ADMIN, FINANCE_MANAGER | Revise / cancel invoices |
| `finance.payment.create` | ADMIN, FINANCE_MANAGER, CASHIER | Record payments |
| `finance.payment.read` | ADMIN, FINANCE_MANAGER, CASHIER | View payments |
| `finance.reports.read` | ADMIN, FINANCE_MANAGER | Day book, analytics |
| `identity.staff.read` | ADMIN | View staff list |
| `identity.roles.assign` | ADMIN | Assign roles |
| `comms.leave.approve` | ADMIN, HR_MANAGER | Approve leave |

---

## 18. Postman Collection

**Files:**
- `postman/Vebgenix-API.postman_collection.json`
- `postman/Vebgenix-Dev.postman_environment.json`

Import both into Postman. All requests auto-save response IDs into environment variables for chaining.

### Environment variables

| Variable | Set by | Description |
|----------|--------|-------------|
| `appsync_url` | Manual | AppSync GraphQL endpoint |
| `cognito_region` | Manual | e.g. `ap-south-1` |
| `cognito_client_id` | Manual | Cognito App Client ID |
| `id_token` | Get Token | Cognito ID token (used in Authorization header) |
| `access_token` | Get Token | Cognito Access token |
| `refresh_token` | Get Token | Refresh token |
| `tenant_id` | Me / Manual | Tenant ObjectId |
| `campus_id` | Create Campus / List Campuses | Campus ObjectId |
| `academic_year_id` | Create Academic Year | Current year ID |
| `to_academic_year_id` | Manual | Target year for promotions |
| `program_id` | Create Program | Program ObjectId |
| `class_id` | Create Class | Class/grade ObjectId |
| `section_id` | Create Section | Section ObjectId |
| `to_class_id` | Manual | Target class for promotions |
| `fee_category_id` | Create Fee Category | Fee category ObjectId |
| `fee_head_id` | Create Fee Head | Fee head ObjectId |
| `fee_schedule_id` | Create Fee Schedule | Schedule ObjectId |
| `fee_structure_id` | Create Fee Structure | Structure ObjectId |
| `fee_assignment_id` | Assign Fee Structure | Assignment ObjectId |
| `student_id` | Enroll Student | Student ObjectId |
| `invoice_id` | Get Student Invoices | Invoice ObjectId |
| `payment_id` | Record Payment | Payment ObjectId |
| `receipt_id` | List Receipts | Receipt ObjectId |
| `exam_id` | Create Exam | Exam ObjectId |
| `promotion_batch_id` | Promote Students | Promotion batch ObjectId |

---

## 19. End-to-End Workflow

Run these Postman requests in order to set up and test the full academic cycle:

```
Step  Request                          Saves
────────────────────────────────────────────────────────────────
 1.   Get Token                        id_token, access_token
 2.   Me (current user)                tenant_id

── Settings ──────────────────────────────────────────────────
 3.   Create Academic Year             academic_year_id
 4.   Set Active Academic Year
 5.   List Academic Years              (verify)
 6.   Create Campus                    campus_id
 7.   Create Program                   program_id
 8.   Update Tenant Features           (enable all modules)

── Classes & Sections ────────────────────────────────────────
 9.   Create Class                     class_id
10.   Create Section                   section_id

── Fee Setup ─────────────────────────────────────────────────
11.   Create Fee Category              fee_category_id
12.   Create Fee Head                  fee_head_id
13.   Create Fee Schedule              fee_schedule_id
14.   Create Fee Structure             fee_structure_id

── Student Enrollment ────────────────────────────────────────
15.   Enroll Student                   student_id
16.   Assign Student to Class
17.   Get Student                      (verify)

── Fee Assignment ────────────────────────────────────────────
18.   Get Fee Assignment Queue         (see unassigned)
19.   Assign Fee Structure             fee_assignment_id
20.   Get Student Invoices             invoice_id
21.   Student Dues                     (verify outstanding)

── Payments ──────────────────────────────────────────────────
22.   Record Payment (Cash)            payment_id
23.   List Receipts                    receipt_id
24.   Get Receipt
25.   Student Dues                     (verify reduced)

── Exams ─────────────────────────────────────────────────────
26.   Create Exam                      exam_id
27.   Publish Results

── Promotions ────────────────────────────────────────────────
28.   Create Academic Year (next)      to_academic_year_id  ← set manually
29.   Create Class (next grade)        to_class_id          ← set manually
30.   Create Section (next grade)
31.   Create Fee Structure (next year) fee_structure_id (next)
32.   Set Promotion Eligibility        (mark students ELIGIBLE)
33.   Promote Students                 promotion_batch_id
34.   List Promotion Batch Items       (verify results)
35.   Get Student                      (verify new classId/sectionId)
```

> **After step 33**, each promoted student has a new `StudentAcademicEnrollment` record for `to_academic_year_id` and their `Student.classId` / `Student.sectionId` are updated to the new grade/section.

