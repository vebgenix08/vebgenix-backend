# Vebgenix Postman API Documentation

This file documents the importable Postman collection in this folder. It is generated from `Vebgenix-API.postman_collection.json`, so the endpoint list matches the collection.

Collection request count: 156

## Files

| File | Purpose |
| --- | --- |
| `Vebgenix-API.postman_collection.json` | Full REST + AppSync Postman collection. |
| `Vebgenix-Dev.postman_environment.json` | Local/dev environment variables used by the collection. |
| `README.md` | This Postman testing guide and endpoint reference. |

## Import Into Postman

1. Open Postman.
2. Select Import.
3. Import `postman/Vebgenix-API.postman_collection.json`.
4. Import `postman/Vebgenix-Dev.postman_environment.json`.
5. Select the `Vebgenix Dev` environment.
6. Set `base_url`, `tenant_id`, Cognito values, and `appsync_url` if testing GraphQL.
7. Run `Auth (Cognito) -> Get Token — User+Password`, then use the saved `access_token` for protected APIs.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `base_url` | Yes | REST base URL. Local example: `http://localhost:5000`. API Gateway/dev URL can be used after deployment. |
| `appsync_url` | When used | AWS AppSync GraphQL endpoint URL. |
| `cognito_region` | When used | AWS region for Cognito, usually `ap-south-1`. |
| `cognito_client_id` | When used | Cognito app client id used by token requests. |
| `cognito_user_pool` | When used | Cognito user pool id. Kept for reference. |
| `access_token` | Yes | Cognito access token. Auto-saved by the token request. |
| `id_token` | When used | Cognito id token. Auto-saved by the token request. |
| `refresh_token` | When used | Cognito refresh token. Auto-saved by the token request. |
| `tenant_id` | Yes | Current tenant id. Required by tenant-scoped admin APIs through `x-tenant-id`. |
| `campus_id` | When used | Campus id used by create/filter requests. |
| `student_id` | When used | Student id captured from student APIs and reused by academic/finance requests. |
| `studentName` | When used | Student name used in payment/customer examples. |
| `fee_category_id` | When used | Fee category id captured after creating a fee category. |
| `exam_id` | When used | Exam id captured after creating an exam. |
| `razorpay_order_id` | When used | Gateway order id used for Razorpay webhook/payment verification examples. |
| `upload_key` | When used | Storage object key captured after requesting an upload URL. |

## Common Headers

Protected REST requests usually use:

```http
Authorization: Bearer {{access_token}}
x-tenant-id: {{tenant_id}}
Content-Type: application/json
```

Public requests, health checks, and Cognito token requests do not use this header set.

## Recommended Testing Order

1. `Auth (Cognito) -> Get Token — User+Password`
2. `Health -> Health Check`
3. `Settings -> Tenants/Campus/Academic Year` setup if needed
4. `Admissions -> Enquiries -> Applications -> Approve Application`
5. `Academics -> Students & Enrollments -> Registration Numbers -> Roll Numbers`
6. `Finance -> Fee Categories -> Fee Heads -> Fee Schedules -> Fee Structures -> Fee Assignments -> Invoices -> Payments -> Payment Allocations`
7. `Academics -> Promotions` after current-year enrollment data exists
8. `Storage`, `Comms`, `Results`, and `Audit & Cleanup` as needed

## Important Business Flows

### Finance Flow

```text
FeeCategory -> FeeHead -> FeeSchedule -> FeeStructure -> FeeAssignment -> Invoice -> Payment -> PaymentAllocation -> Receipt
```

Invoice is the fee order/demand. Every successful collection creates a Payment, allocations split it fee-head-wise, and receipt number belongs to the successful payment.

### Academic Numbering Flow

```text
Application No -> Admission No -> Registration No -> Roll No
```

Application No tracks admission application. Admission No is permanent. Registration No is academic-year + campus + grade wise. Roll No is academic-year + campus + grade + section wise.

### Promotion Flow

```text
Current Enrollment -> Promotion Batch -> New Academic-Year Enrollment -> Pending/New Registration No -> Pending/New Roll No -> Optional next-year fee assignment/invoices
```

Promotion creates new enrollment records. It does not move old invoices or old balances.

## Endpoint Summary

### 🔐 Auth (Cognito)

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Get Token — User+Password | `POST` | `https://cognito-idp.{{cognito_region}}.amazonaws.com/` | Cognito service request | `{{cognito_client_id}}`, `{{cognito_region}}` |
| Refresh Token | `POST` | `https://cognito-idp.{{cognito_region}}.amazonaws.com/` | Cognito service request | `{{cognito_client_id}}`, `{{cognito_region}}`, `{{refresh_token}}` |
| Sign Out (Revoke Token) | `POST` | `https://cognito-idp.{{cognito_region}}.amazonaws.com/` | Cognito service request | `{{cognito_client_id}}`, `{{cognito_region}}`, `{{refresh_token}}` |
| Me — My Profile | `GET` | `{{base_url}}/api/me` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 👤 Identity — Users & Staff

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Users | `GET` | `{{base_url}}/api/admin/users` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create User | `POST` | `{{base_url}}/api/admin/users` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Get User | `GET` | `{{base_url}}/api/admin/users/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Update User | `PATCH` | `{{base_url}}/api/admin/users/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Delete User | `DELETE` | `{{base_url}}/api/admin/users/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Staff | `GET` | `{{base_url}}/api/admin/staff` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Invite Staff | `POST` | `{{base_url}}/api/admin/staff` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |

### 📋 Admissions / Enquiries

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Enquiries | `GET` | `{{base_url}}/api/admissions/enquiries` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Enquiry | `POST` | `{{base_url}}/api/admissions/enquiries` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Get Enquiry | `GET` | `{{base_url}}/api/admissions/enquiries/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Update Enquiry | `PATCH` | `{{base_url}}/api/admissions/enquiries/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Duplicate Check | `POST` | `{{base_url}}/api/admissions/duplicate-check` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 📋 Admissions / Applications

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Applications | `GET` | `{{base_url}}/api/admissions/applications` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Application | `POST` | `{{base_url}}/api/admissions/applications` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Get Application | `GET` | `{{base_url}}/api/admissions/applications/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Review Application | `POST` | `{{base_url}}/api/admissions/applications/:id/review` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Approve Application | `POST` | `{{base_url}}/api/admissions/applications/:id/approve` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Withdraw Application | `POST` | `{{base_url}}/api/admissions/applications/:id/withdraw` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Fee Categories

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Fee Categories | `GET` | `{{base_url}}/api/admin/finance/fee-categories?activeOnly=true` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Fee Category | `GET` | `{{base_url}}/api/admin/finance/fee-categories/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Fee Category | `POST` | `{{base_url}}/api/admin/finance/fee-categories` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Update Fee Category | `PATCH` | `{{base_url}}/api/admin/finance/fee-categories/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Delete Fee Category | `DELETE` | `{{base_url}}/api/admin/finance/fee-categories/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Fee Heads

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Fee Heads | `GET` | `{{base_url}}/api/admin/finance/fee-heads?feeCategoryId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Fee Head | `POST` | `{{base_url}}/api/admin/finance/fee-heads` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Update Fee Head | `PATCH` | `{{base_url}}/api/admin/finance/fee-heads/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Delete Fee Head | `DELETE` | `{{base_url}}/api/admin/finance/fee-heads/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Fee Schedules

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Fee Schedules | `GET` | `{{base_url}}/api/admin/finance/fee-schedules?academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Fee Schedule | `POST` | `{{base_url}}/api/admin/finance/fee-schedules` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Update Fee Schedule | `PATCH` | `{{base_url}}/api/admin/finance/fee-schedules/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Add Schedule Slot | `POST` | `{{base_url}}/api/admin/finance/fee-schedules/:id/slots` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Delete Schedule Slot | `DELETE` | `{{base_url}}/api/admin/finance/fee-schedules/:id/slots/:slotIndex` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Delete Fee Schedule | `DELETE` | `{{base_url}}/api/admin/finance/fee-schedules/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Fee Structures

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Fee Structures | `GET` | `{{base_url}}/api/admin/finance/fee-structures?academicYearId=&feeCategoryId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Fee Structure | `GET` | `{{base_url}}/api/admin/finance/fee-structures/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Fee Structure | `POST` | `{{base_url}}/api/admin/finance/fee-structures` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Update Fee Structure | `PATCH` | `{{base_url}}/api/admin/finance/fee-structures/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Delete Fee Structure | `DELETE` | `{{base_url}}/api/admin/finance/fee-structures/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Copy Fee Pattern to Next Year | `POST` | `{{base_url}}/api/admin/finance/fee-pattern/copy` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |

### 💰 Finance / Fee Assignments

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Fee Assignments | `GET` | `{{base_url}}/api/admin/finance/fee-assignments?studentId=&academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Fee Assignment | `GET` | `{{base_url}}/api/admin/finance/fee-assignments/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Student Fee Assignment | `GET` | `{{base_url}}/api/admin/finance/students/:studentId/fee-assignment?academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Assign Fee Structure | `POST` | `{{base_url}}/api/admin/finance/fee-assignments` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Bulk Assign Fee Structure | `POST` | `{{base_url}}/api/admin/finance/fee-assignments/bulk` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Fee Assignment Queue | `GET` | `{{base_url}}/api/admin/finance/fee-assignment-queue?academicYearId=&classId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Assignable Fee Structures | `GET` | `{{base_url}}/api/admin/finance/assignable-fee-structures?academicYearId=&classId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Invoices

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Invoices | `GET` | `{{base_url}}/api/admin/finance/invoices?studentId=&status=PENDING` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Invoice | `GET` | `{{base_url}}/api/admin/finance/invoices/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create One-off Charge | `POST` | `{{base_url}}/api/admin/finance/invoices` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Student Dues | `GET` | `{{base_url}}/api/admin/finance/students/:studentId/dues` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Payments

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Record Payment (Cash/Cheque/UPI) | `POST` | `{{base_url}}/api/admin/finance/payments` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Record Payment — Manual Allocation | `POST` | `{{base_url}}/api/admin/finance/payments` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Collect All Dues — Student | `POST` | `{{base_url}}/api/admin/finance/students/:studentId/collect` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Create Razorpay Order | `POST` | `{{base_url}}/api/finance/payments/create-order` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Verify Razorpay Signature | `POST` | `{{base_url}}/api/finance/payments/verify` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{razorpay_order_id}}`, `{{tenant_id}}` |
| List Payments | `GET` | `{{base_url}}/api/admin/finance/payments?invoiceId=&status=SUCCESS` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Payment | `GET` | `{{base_url}}/api/admin/finance/payments/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Receipts | `GET` | `{{base_url}}/api/admin/finance/receipts?studentId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Receipt | `GET` | `{{base_url}}/api/admin/finance/receipts/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Payment Allocations

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Allocations by Payment | `GET` | `{{base_url}}/api/admin/finance/payments/:paymentId/allocations` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Allocations by Invoice | `GET` | `{{base_url}}/api/admin/finance/invoices/:invoiceId/allocations` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 💰 Finance / Reports

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Day Book | `GET` | `{{base_url}}/api/admin/finance/reports/day-book?from=2025-06-01&to=2025-06-30&campusId={{campus_id}}` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Fee Collection Analytics | `GET` | `{{base_url}}/api/admin/finance/reports/analytics?academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Student Financial Summary | `GET` | `{{base_url}}/api/admin/finance/students/:studentId/summary` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Classes & Sections

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Classes | `GET` | `{{base_url}}/api/admin/academics/classes?academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Class | `POST` | `{{base_url}}/api/admin/academics/classes` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| List All Sections | `GET` | `{{base_url}}/api/admin/academics/sections?classId=&academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Section | `POST` | `{{base_url}}/api/admin/academics/sections` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Set Section Incharge | `POST` | `{{base_url}}/api/admin/academics/sections/:id/incharge` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Students & Enrollments

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Students | `GET` | `{{base_url}}/api/admin/students?classId=&sectionId=&status=ACTIVE` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Enroll Student | `POST` | `{{base_url}}/api/admin/students` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Get Student | `GET` | `{{base_url}}/api/admin/students/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Update Student | `PATCH` | `{{base_url}}/api/admin/students/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Assign Student to Section | `POST` | `{{base_url}}/api/admin/academics/enrollments/assign-section` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Transfer Student Section | `POST` | `{{base_url}}/api/admin/academics/enrollments/transfer-section` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Enrollments | `GET` | `{{base_url}}/api/admin/academics/enrollments?academicYearId=&classId=&sectionId=&status=ACTIVE` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Enable Portal Access | `POST` | `{{base_url}}/api/admin/students/:id/portal-access` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Registration Numbers

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Registration Batches | `GET` | `{{base_url}}/api/admin/academics/registration-batches?academicYearId=&classId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Generate Registration Numbers | `POST` | `{{base_url}}/api/admin/academics/registration-numbers/generate` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Freeze Registration Numbers | `POST` | `{{base_url}}/api/admin/academics/registration-numbers/freeze` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Roll Numbers

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Roll Number Batches | `GET` | `{{base_url}}/api/admin/academics/roll-no-batches?academicYearId=&classId=&sectionId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Generate Roll Numbers | `POST` | `{{base_url}}/api/admin/academics/roll-numbers/generate` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Freeze Roll Numbers | `POST` | `{{base_url}}/api/admin/academics/roll-numbers/freeze` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Promotions

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Promotion Batches | `GET` | `{{base_url}}/api/admin/academics/promotions?fromAcademicYearId=&toAcademicYearId=&campusId={{campus_id}}&fromGradeId=&status=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Get Promotion Batch | `GET` | `{{base_url}}/api/admin/academics/promotions/:id` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Promotion Batch Items | `GET` | `{{base_url}}/api/admin/academics/promotions/:id/items` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Set Promotion Eligibility (bulk) | `POST` | `{{base_url}}/api/admin/academics/promotion-eligibility` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Promote Students - SAME_SECTION / Skip fees | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - MANUAL sections / Copy fee pattern | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - AUTO_SHUFFLE / Assign existing fee | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - PERFORMANCE_RANK | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - SUBJECT_GROUP | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - TRANSPORT_ROUTE | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - EXCEL_IMPORT / Copy fee pattern | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - CAPACITY_LIMIT | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Promote Students - GENDER_BALANCE | `POST` | `{{base_url}}/api/admin/academics/promotions` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |

### 🎓 Academics / Subjects

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Subjects | `GET` | `{{base_url}}/api/admin/academics/subjects?classId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Subject | `POST` | `{{base_url}}/api/admin/academics/subjects` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Attendance

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Get Section Attendance | `GET` | `{{base_url}}/api/admin/academics/attendance?classId=&sectionId=&date=2026-05-04` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Mark Section Attendance | `POST` | `{{base_url}}/api/admin/academics/attendance` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🎓 Academics / Exams & Results

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Exams | `GET` | `{{base_url}}/api/admin/academics/exams?classId=&academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Exam | `POST` | `{{base_url}}/api/admin/academics/exams` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Enter Marks | `POST` | `{{base_url}}/api/admin/academics/exams/:id/marks` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Publish Results | `POST` | `{{base_url}}/api/admin/academics/exams/:id/publish` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Result Batches | `GET` | `{{base_url}}/api/admin/academics/result-batches?academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Result Batch | `POST` | `{{base_url}}/api/admin/academics/result-batches` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Publish Result Batch | `POST` | `{{base_url}}/api/admin/academics/result-batches/:id/publish` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Public Result Token | `GET` | `{{base_url}}/api/admin/academics/result-batches/:id/public-token` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Public Result (no auth) | `GET` | `{{base_url}}/api/results/public?token=` | No bearer token in request headers | `{{base_url}}` |

### 🎓 Academics / Certificates

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Issue Certificate | `POST` | `{{base_url}}/api/admin/academics/certificates` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Certificates | `GET` | `{{base_url}}/api/admin/academics/certificates?studentId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### ⚙️ Settings

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Tenants (Platform) | `GET` | `{{base_url}}/api/platform/tenants` | Bearer token required | `{{access_token}}`, `{{base_url}}` |
| Get Tenant | `GET` | `{{base_url}}/api/tenants/:tenantId` | Bearer token required | `{{access_token}}`, `{{base_url}}` |
| Create Tenant (Platform) | `POST` | `{{base_url}}/api/platform/tenants` | Bearer token required | `{{access_token}}`, `{{base_url}}` |
| Finalize Tenant | `POST` | `{{base_url}}/api/platform/tenants/:tenantId/finalize` | Bearer token required | `{{access_token}}`, `{{base_url}}` |
| List Campuses | `GET` | `{{base_url}}/api/tenants/:tenantId/campuses` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Campus | `POST` | `{{base_url}}/api/tenants/:tenantId/campuses` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Programs | `GET` | `{{base_url}}/api/admin/programs` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Program | `POST` | `{{base_url}}/api/admin/programs` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| List Academic Years | `GET` | `{{base_url}}/api/tenants/:tenantId/academic-years` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Academic Year | `POST` | `{{base_url}}/api/tenants/:tenantId/academic-years` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Set Active Academic Year | `POST` | `{{base_url}}/api/tenants/:tenantId/academic-years/:id/activate` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Tenant Features | `GET` | `{{base_url}}/api/admin/features` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Update Tenant Features | `PATCH` | `{{base_url}}/api/admin/features` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Templates | `GET` | `{{base_url}}/api/templates` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Template | `POST` | `{{base_url}}/api/templates` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Publish Template Version | `POST` | `{{base_url}}/api/templates/:id/publish` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{studentName}}`, `{{tenant_id}}` |
| Dashboard Overview | `GET` | `{{base_url}}/api/dashboard` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Super Admin Overview | `GET` | `{{base_url}}/api/platform/overview` | Bearer token required | `{{access_token}}`, `{{base_url}}` |

### 📢 Comms

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Announcements | `GET` | `{{base_url}}/api/admin/announcements` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Announcement | `POST` | `{{base_url}}/api/admin/announcements` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Publish Announcement | `POST` | `{{base_url}}/api/admin/announcements/:id/publish` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Events | `GET` | `{{base_url}}/api/admin/events` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Event | `POST` | `{{base_url}}/api/admin/events` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| List Leave Requests | `GET` | `{{base_url}}/api/admin/leave` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Create Leave Request | `POST` | `{{base_url}}/api/admin/leave` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Approve/Reject Leave | `POST` | `{{base_url}}/api/admin/leave/:id/approve` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🗓 Timetable

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Get Section Timetable | `GET` | `{{base_url}}/api/timetable?classId=&sectionId=&academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Teacher Timetable | `GET` | `{{base_url}}/api/timetable/teacher?teacherId=&academicYearId=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Replace Section Timetable | `PUT` | `{{base_url}}/api/timetable` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}` |

### 📁 Storage

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Get Upload URL | `POST` | `{{base_url}}/api/storage/upload-url` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Get Download URL | `GET` | `{{base_url}}/api/storage/download-url?key={{upload_key}}` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`, `{{upload_key}}` |

### 🔍 Audit & Cleanup

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| List Audit Logs | `GET` | `{{base_url}}/api/audit-logs?limit=50&entityType=` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| List Platform Audit Logs | `GET` | `{{base_url}}/api/platform/audit-logs?limit=50` | Bearer token required | `{{access_token}}`, `{{base_url}}` |
| Duplicate Student Report | `GET` | `{{base_url}}/api/admin/cleanup/duplicate-students` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Merge Students | `POST` | `{{base_url}}/api/admin/cleanup/merge-students` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |
| Merge Enquiries | `POST` | `{{base_url}}/api/admin/cleanup/merge-enquiries` | Bearer token required | `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}` |

### 🔗 AppSync GraphQL

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Promote Students | `POST` | `{{appsync_url}}` | Bearer token required | `{{access_token}}`, `{{appsync_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Set Promotion Eligibility | `POST` | `{{appsync_url}}` | Bearer token required | `{{access_token}}`, `{{appsync_url}}`, `{{tenant_id}}` |
| List Promotion Batches | `POST` | `{{appsync_url}}` | Bearer token required | `{{access_token}}`, `{{appsync_url}}`, `{{campus_id}}`, `{{tenant_id}}` |
| Copy Fee Pattern to Next Year | `POST` | `{{appsync_url}}` | Bearer token required | `{{access_token}}`, `{{appsync_url}}`, `{{campus_id}}`, `{{tenant_id}}` |

### ❤️ Health

| Request | Method | URL | Auth | Variables |
| --- | --- | --- | --- | --- |
| Health Check | `GET` | `{{base_url}}/api/health` | No bearer token in request headers | `{{base_url}}` |

## Request Details

### 🔐 Auth (Cognito)

#### Get Token — User+Password

- Method: `POST`
- URL: `https://cognito-idp.{{cognito_region}}.amazonaws.com/`
- Auth: Cognito service request
- Environment variables: `{{cognito_client_id}}`, `{{cognito_region}}`
- Example body:
```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "{{cognito_client_id}}",
  "AuthParameters": { "USERNAME": "admin@example.com", "PASSWORD": "YourPassword1!" }
}
```

#### Refresh Token

- Method: `POST`
- URL: `https://cognito-idp.{{cognito_region}}.amazonaws.com/`
- Auth: Cognito service request
- Environment variables: `{{cognito_client_id}}`, `{{cognito_region}}`, `{{refresh_token}}`
- Example body:
```json
{
  "AuthFlow": "REFRESH_TOKEN_AUTH",
  "ClientId": "{{cognito_client_id}}",
  "AuthParameters": { "REFRESH_TOKEN": "{{refresh_token}}" }
}
```

#### Sign Out (Revoke Token)

- Method: `POST`
- URL: `https://cognito-idp.{{cognito_region}}.amazonaws.com/`
- Auth: Cognito service request
- Environment variables: `{{cognito_client_id}}`, `{{cognito_region}}`, `{{refresh_token}}`
- Example body:
```json
{
  "Token": "{{refresh_token}}",
  "ClientId": "{{cognito_client_id}}"
}
```

#### Me — My Profile

- Method: `GET`
- URL: `{{base_url}}/api/me`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 👤 Identity — Users & Staff

#### List Users

- Method: `GET`
- URL: `{{base_url}}/api/admin/users`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create User

- Method: `POST`
- URL: `{{base_url}}/api/admin/users`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "email": "user@example.com",
  "fullName": "John Doe",
  "phone": "9876543210",
  "personaRole": "STAFF",
  "campusId": "{{campus_id}}"
}
```

#### Get User

- Method: `GET`
- URL: `{{base_url}}/api/admin/users/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Update User

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/users/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fullName": "Jane Doe",
  "isActive": true
}
```

#### Delete User

- Method: `DELETE`
- URL: `{{base_url}}/api/admin/users/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Staff

- Method: `GET`
- URL: `{{base_url}}/api/admin/staff`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Invite Staff

- Method: `POST`
- URL: `{{base_url}}/api/admin/staff`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "email": "teacher@example.com",
  "fullName": "Mr. Smith",
  "phone": "9876543211",
  "campusId": "{{campus_id}}",
  "staffType": "TEACHER",
  "staffCategory": "TEACHING"
}
```

### 📋 Admissions / Enquiries

#### List Enquiries

- Method: `GET`
- URL: `{{base_url}}/api/admissions/enquiries`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Enquiry

- Method: `POST`
- URL: `{{base_url}}/api/admissions/enquiries`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "campusId": "{{campus_id}}",
  "studentName": "Alice Johnson",
  "phone": "9876543210",
  "email": "alice@example.com",
  "source": "Website",
  "notes": "Interested in Grade 9"
}
```

#### Get Enquiry

- Method: `GET`
- URL: `{{base_url}}/api/admissions/enquiries/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Update Enquiry

- Method: `PATCH`
- URL: `{{base_url}}/api/admissions/enquiries/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "status": "CONTACTED",
  "notes": "Called, scheduled visit"
}
```

#### Duplicate Check

- Method: `POST`
- URL: `{{base_url}}/api/admissions/duplicate-check`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "phone": "9876543210",
  "email": "alice@example.com"
}
```

### 📋 Admissions / Applications

#### List Applications

- Method: `GET`
- URL: `{{base_url}}/api/admissions/applications`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Application

- Method: `POST`
- URL: `{{base_url}}/api/admissions/applications`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "studentName": "Alice Johnson",
  "phone": "9876543210",
  "email": "alice@example.com",
  "dateOfBirth": "2010-06-15",
  "gender": "FEMALE",
  "guardianName": "Bob Johnson",
  "guardianPhone": "9876543299",
  "guardianRelation": "FATHER"
}
```

#### Get Application

- Method: `GET`
- URL: `{{base_url}}/api/admissions/applications/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Review Application

- Method: `POST`
- URL: `{{base_url}}/api/admissions/applications/:id/review`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "decision": "APPROVED",
  "remarks": "All documents verified"
}
```

#### Approve Application

- Method: `POST`
- URL: `{{base_url}}/api/admissions/applications/:id/approve`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "campusId": "{{campus_id}}",
  "classId": "",
  "sectionId": "",
  "academicYearId": ""
}
```

#### Withdraw Application

- Method: `POST`
- URL: `{{base_url}}/api/admissions/applications/:id/withdraw`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Fee Categories

#### List Fee Categories

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-categories?activeOnly=true`
- Auth: Bearer token required
- Query parameters: `activeOnly`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Fee Category

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-categories/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Fee Category

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-categories`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "General Fee",
  "feeType": "GENERAL",
  "moduleType": "FEE",
  "invoicePrefix": "GEN/INV",
  "receiptPrefix": "GEN/REC",
  "defaultAllocationMethod": "PRO_RATA"
}
```

#### Update Fee Category

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/finance/fee-categories/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "defaultAllocationMethod": "PRIORITY_WISE"
}
```

#### Delete Fee Category

- Method: `DELETE`
- URL: `{{base_url}}/api/admin/finance/fee-categories/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Fee Heads

#### List Fee Heads

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-heads?feeCategoryId=`
- Auth: Bearer token required
- Query parameters: `feeCategoryId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Fee Head

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-heads`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Tuition Fee",
  "type": "RECURRING",
  "feeCategoryId": "",
  "code": "TUI",
  "isRefundable": false,
  "isMandatory": true,
  "priorityOrder": 1,
  "description": "Monthly tuition charges"
}
```

#### Update Fee Head

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/finance/fee-heads/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "priorityOrder": 2,
  "isRefundable": true
}
```

#### Delete Fee Head

- Method: `DELETE`
- URL: `{{base_url}}/api/admin/finance/fee-heads/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Fee Schedules

#### List Fee Schedules

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-schedules?academicYearId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Fee Schedule

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-schedules`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Quarterly Schedule 25-26",
  "academicYearId": "",
  "feeCategoryId": "",
  "campusId": "{{campus_id}}",
  "collectionType": "PARTIAL_ALLOWED",
  "allowPartialPayment": true,
  "minimumAmount": 0,
  "minimumPercentage": 0,
  "graceDays": 5,
  "lateFeeEnabled": false,
  "notificationEnabled": true,
  "slots": [
    { "name": "Q1", "dueDate": "2025-07-15", "percentOfTotal": 25 },
    { "name": "Q2", "dueDate": "2025-10-15", "percentOfTotal": 25 },
    { "name": "Q3", "dueDate": "2026-01-15", "percentOfTotal": 25 },
    { "name": "Q4", "dueDate": "2026-04-15", "percentOfTotal": 25 }
  ]
}
```

#### Update Fee Schedule

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/finance/fee-schedules/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "graceDays": 10,
  "lateFeeEnabled": true
}
```

#### Add Schedule Slot

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-schedules/:id/slots`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Supplementary",
  "dueDate": "2026-03-01",
  "fixedAmount": 5000
}
```

#### Delete Schedule Slot

- Method: `DELETE`
- URL: `{{base_url}}/api/admin/finance/fee-schedules/:id/slots/:slotIndex`
- Auth: Bearer token required
- Path parameters: `id`, `slotIndex`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Delete Fee Schedule

- Method: `DELETE`
- URL: `{{base_url}}/api/admin/finance/fee-schedules/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Fee Structures

#### List Fee Structures

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-structures?academicYearId=&feeCategoryId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`, `feeCategoryId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Fee Structure

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-structures/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Fee Structure

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-structures`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Grade 10 Annual Fee 25-26",
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "classId": "",
  "feeCategoryId": "",
  "feeScheduleId": "",
  "allocationMethod": "PRO_RATA",
  "components": [
    { "feeHeadId": "", "feeHeadName": "Tuition Fee", "amount": 50000, "isOptional": false, "priorityOrder": 1 },
    { "feeHeadId": "", "feeHeadName": "Lab Fee",     "amount": 5000,  "isOptional": false, "priorityOrder": 2 },
    { "feeHeadId": "", "feeHeadName": "Sports Fee",  "amount": 2000,  "isOptional": true,  "priorityOrder": 3 }
  ]
}
```

#### Update Fee Structure

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/finance/fee-structures/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "allocationMethod": "PRIORITY_WISE"
}
```

#### Delete Fee Structure

- Method: `DELETE`
- URL: `{{base_url}}/api/admin/finance/fee-structures/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Copy Fee Pattern to Next Year

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-pattern/copy`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "feeCategoryId": "",
  "activateCopies": false
}
```

### 💰 Finance / Fee Assignments

#### List Fee Assignments

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-assignments?studentId=&academicYearId=`
- Auth: Bearer token required
- Query parameters: `studentId`, `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Fee Assignment

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-assignments/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Student Fee Assignment

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/students/:studentId/fee-assignment?academicYearId=`
- Auth: Bearer token required
- Path parameters: `studentId`
- Query parameters: `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Assign Fee Structure

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-assignments`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "studentId": "",
  "feeStructureId": "",
  "academicYearId": "",
  "campusId": "{{campus_id}}",
  "discountAmount": 0,
  "discountReason": ""
}
```

#### Bulk Assign Fee Structure

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/fee-assignments/bulk`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "feeStructureId": "",
  "academicYearId": "",
  "campusId": "{{campus_id}}",
  "classId": "",
  "discountAmount": 0
}
```

#### Fee Assignment Queue

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/fee-assignment-queue?academicYearId=&classId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`, `classId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Assignable Fee Structures

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/assignable-fee-structures?academicYearId=&classId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`, `classId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Invoices

#### List Invoices

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/invoices?studentId=&status=PENDING`
- Auth: Bearer token required
- Query parameters: `studentId`, `status`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Invoice

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/invoices/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create One-off Charge

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/invoices`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "studentId": "",
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "feeCategoryId": "",
  "dueDate": "2026-06-30",
  "collectionType": "FULL_ONLY",
  "allocationMethod": "PRO_RATA",
  "items": [
    { "feeHeadId": "", "feeHeadName": "Re-admission Fee", "amount": 2000, "concession": 0, "priorityOrder": 1 }
  ]
}
```

#### Student Dues

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/students/:studentId/dues`
- Auth: Bearer token required
- Path parameters: `studentId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Payments

#### Record Payment (Cash/Cheque/UPI)

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/payments`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "invoiceId": "",
  "studentId": "",
  "campusId": "{{campus_id}}",
  "amount": 10000,
  "method": "CASH",
  "remarks": "Partial payment"
}
```

#### Record Payment — Manual Allocation

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/payments`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "invoiceId": "",
  "studentId": "",
  "campusId": "{{campus_id}}",
  "amount": 10000,
  "method": "CHEQUE",
  "allocations": [
    { "invoiceItemId": "", "allocatedAmount": 8000 },
    { "invoiceItemId": "", "allocatedAmount": 2000 }
  ]
}
```

#### Collect All Dues — Student

- Method: `POST`
- URL: `{{base_url}}/api/admin/finance/students/:studentId/collect`
- Auth: Bearer token required
- Path parameters: `studentId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "amount": 50000,
  "method": "ONLINE",
  "campusId": "{{campus_id}}",
  "academicYearId": ""
}
```

#### Create Razorpay Order

- Method: `POST`
- URL: `{{base_url}}/api/finance/payments/create-order`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "invoiceId": "",
  "studentId": "",
  "campusId": "{{campus_id}}",
  "amount": 50000,
  "currency": "INR"
}
```

#### Verify Razorpay Signature

- Method: `POST`
- URL: `{{base_url}}/api/finance/payments/verify`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{razorpay_order_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "razorpay_order_id": "{{razorpay_order_id}}",
  "razorpay_payment_id": "",
  "razorpay_signature": ""
}
```

#### List Payments

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/payments?invoiceId=&status=SUCCESS`
- Auth: Bearer token required
- Query parameters: `invoiceId`, `status`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Payment

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/payments/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Receipts

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/receipts?studentId=`
- Auth: Bearer token required
- Query parameters: `studentId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Receipt

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/receipts/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Payment Allocations

#### List Allocations by Payment

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/payments/:paymentId/allocations`
- Auth: Bearer token required
- Path parameters: `paymentId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Allocations by Invoice

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/invoices/:invoiceId/allocations`
- Auth: Bearer token required
- Path parameters: `invoiceId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 💰 Finance / Reports

#### Day Book

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/reports/day-book?from=2025-06-01&to=2025-06-30&campusId={{campus_id}}`
- Auth: Bearer token required
- Query parameters: `from`, `to`, `campusId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`

#### Fee Collection Analytics

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/reports/analytics?academicYearId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Student Financial Summary

- Method: `GET`
- URL: `{{base_url}}/api/admin/finance/students/:studentId/summary`
- Auth: Bearer token required
- Path parameters: `studentId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### 🎓 Academics / Classes & Sections

#### List Classes

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/classes?academicYearId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Class

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/classes`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Grade 10",
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "orderIndex": 10
}
```

#### List All Sections

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/sections?classId=&academicYearId=`
- Auth: Bearer token required
- Query parameters: `classId`, `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Section

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/sections`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "classId": "",
  "name": "A",
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "maxStrength": 40
}
```

#### Set Section Incharge

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/sections/:id/incharge`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "teacherId": ""
}
```

### 🎓 Academics / Students & Enrollments

#### List Students

- Method: `GET`
- URL: `{{base_url}}/api/admin/students?classId=&sectionId=&status=ACTIVE`
- Auth: Bearer token required
- Query parameters: `classId`, `sectionId`, `status`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Enroll Student

- Method: `POST`
- URL: `{{base_url}}/api/admin/students`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "fullName": "Alice Johnson",
  "phone": "9876543210",
  "email": "alice@example.com",
  "dateOfBirth": "2010-06-15",
  "gender": "FEMALE",
  "classId": "",
  "sectionId": "",
  "transportRouteId": "ROUTE_A",
  "guardians": [{ "name": "Bob Johnson", "relation": "FATHER", "phone": "9876543299" }]
}
```

#### Get Student

- Method: `GET`
- URL: `{{base_url}}/api/admin/students/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Update Student

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/students/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "transportRouteId": "ROUTE_B",
  "classId": "",
  "sectionId": ""
}
```

#### Assign Student to Section

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/enrollments/assign-section`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "studentId": "",
  "sectionId": "",
  "academicYearId": ""
}
```

#### Transfer Student Section

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/enrollments/transfer-section`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "studentId": "",
  "fromSectionId": "",
  "toSectionId": "",
  "academicYearId": "",
  "reason": "Parental request"
}
```

#### List Enrollments

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/enrollments?academicYearId=&classId=&sectionId=&status=ACTIVE`
- Auth: Bearer token required
- Query parameters: `academicYearId`, `classId`, `sectionId`, `status`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Enable Portal Access

- Method: `POST`
- URL: `{{base_url}}/api/admin/students/:id/portal-access`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "email": "alice@example.com"
}
```

### 🎓 Academics / Registration Numbers

#### List Registration Batches

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/registration-batches?academicYearId=&classId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`, `classId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Generate Registration Numbers

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/registration-numbers/generate`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "academicYearId": "",
  "campusId": "{{campus_id}}",
  "gradeId": "",
  "prefix": "REG",
  "startFrom": 1,
  "padLength": 4
}
```

#### Freeze Registration Numbers

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/registration-numbers/freeze`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "batchId": ""
}
```

### 🎓 Academics / Roll Numbers

#### List Roll Number Batches

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/roll-no-batches?academicYearId=&classId=&sectionId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`, `classId`, `sectionId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Generate Roll Numbers

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/roll-numbers/generate`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "academicYearId": "",
  "campusId": "{{campus_id}}",
  "gradeId": "",
  "sectionId": "",
  "mode": "ALPHABETICAL",
  "startFrom": 1
}
```

#### Freeze Roll Numbers

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/roll-numbers/freeze`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "batchId": ""
}
```

### 🎓 Academics / Promotions

#### List Promotion Batches

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/promotions?fromAcademicYearId=&toAcademicYearId=&campusId={{campus_id}}&fromGradeId=&status=`
- Auth: Bearer token required
- Query parameters: `fromAcademicYearId`, `toAcademicYearId`, `campusId`, `fromGradeId`, `status`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`

#### Get Promotion Batch

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/promotions/:id`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Promotion Batch Items

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/promotions/:id/items`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Set Promotion Eligibility (bulk)

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotion-eligibility`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "academicYearId": "",
  "updates": [
    {
      "studentId": "",
      "eligibility": "ELIGIBLE"
    },
    {
      "studentId": "",
      "eligibility": "DETAINED"
    },
    {
      "studentId": "",
      "eligibility": "ON_HOLD"
    }
  ]
}
```

#### Promote Students - SAME_SECTION / Skip fees

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    "",
    ""
  ],
  "sectionStrategy": "SAME_SECTION",
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "SKIP",
  "allowPendingFee": false
}
```

#### Promote Students - MANUAL sections / Copy fee pattern

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    "",
    ""
  ],
  "sectionStrategy": "MANUAL",
  "sectionAssignments": [
    {
      "studentId": "",
      "sectionId": ""
    },
    {
      "studentId": "",
      "sectionId": ""
    }
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "COPY_PATTERN",
  "feeCategoryId": "",
  "allowPendingFee": false
}
```

#### Promote Students - AUTO_SHUFFLE / Assign existing fee

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    "",
    ""
  ],
  "sectionStrategy": "AUTO_SHUFFLE",
  "targetSectionIds": [
    "",
    "",
    ""
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "ASSIGN_EXISTING",
  "feeStructureIds": [
    ""
  ],
  "allowPendingFee": false
}
```

#### Promote Students - PERFORMANCE_RANK

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    ""
  ],
  "sectionStrategy": "PERFORMANCE_RANK",
  "rankByExamId": "",
  "targetSectionIds": [
    "",
    ""
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "SKIP"
}
```

#### Promote Students - SUBJECT_GROUP

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    ""
  ],
  "sectionStrategy": "SUBJECT_GROUP",
  "subjectGroupSectionMap": [
    {
      "subjectGroupId": "HINDI",
      "sectionId": ""
    },
    {
      "subjectGroupId": "FRENCH",
      "sectionId": ""
    }
  ],
  "targetSectionIds": [
    ""
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "SKIP"
}
```

#### Promote Students - TRANSPORT_ROUTE

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    ""
  ],
  "sectionStrategy": "TRANSPORT_ROUTE",
  "transportRouteSectionMap": [
    {
      "transportRouteId": "ROUTE_A",
      "sectionId": ""
    },
    {
      "transportRouteId": "ROUTE_B",
      "sectionId": ""
    }
  ],
  "targetSectionIds": [
    ""
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "SKIP"
}
```

#### Promote Students - EXCEL_IMPORT / Copy fee pattern

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    "",
    ""
  ],
  "sectionStrategy": "EXCEL_IMPORT",
  "sectionAssignments": [
    {
      "studentId": "",
      "sectionId": ""
    },
    {
      "studentId": "",
      "sectionId": ""
    }
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "COPY_PATTERN",
  "feeCategoryId": "",
  "allowPendingFee": false
}
```

#### Promote Students - CAPACITY_LIMIT

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    ""
  ],
  "sectionStrategy": "CAPACITY_LIMIT",
  "targetSectionIds": [
    "",
    ""
  ],
  "maxStudentsPerSection": 40,
  "eligibilityMode": "IGNORE_RESULTS",
  "feeAction": "SKIP"
}
```

#### Promote Students - GENDER_BALANCE

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/promotions`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fromAcademicYearId": "",
  "toAcademicYearId": "",
  "campusId": "{{campus_id}}",
  "fromGradeId": "",
  "toGradeId": "",
  "studentIds": [
    ""
  ],
  "sectionStrategy": "GENDER_BALANCE",
  "targetSectionIds": [
    "",
    ""
  ],
  "eligibilityMode": "USE_ENROLLMENT_ELIGIBILITY",
  "feeAction": "SKIP"
}
```

### 🎓 Academics / Subjects

#### List Subjects

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/subjects?classId=`
- Auth: Bearer token required
- Query parameters: `classId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Subject

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/subjects`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Mathematics",
  "code": "MATH",
  "classId": "",
  "type": "CORE"
}
```

### 🎓 Academics / Attendance

#### Get Section Attendance

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/attendance?classId=&sectionId=&date=2026-05-04`
- Auth: Bearer token required
- Query parameters: `classId`, `sectionId`, `date`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Mark Section Attendance

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/attendance`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "classId": "",
  "sectionId": "",
  "date": "2026-05-04",
  "entries": [
    { "studentId": "", "status": "PRESENT" },
    { "studentId": "", "status": "ABSENT" }
  ]
}
```

### 🎓 Academics / Exams & Results

#### List Exams

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/exams?classId=&academicYearId=`
- Auth: Bearer token required
- Query parameters: `classId`, `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Exam

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/exams`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "classId": "",
  "sectionId": "",
  "name": "Annual Exam 2025-26",
  "examDate": "2026-03-15",
  "maxMarks": 100,
  "passingMarks": 33
}
```

#### Enter Marks

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/exams/:id/marks`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "studentId": "",
  "marksObtained": 85,
  "maxMarks": 100,
  "grade": "A",
  "isAbsent": false
}
```

#### Publish Results

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/exams/:id/publish`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Result Batches

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/result-batches?academicYearId=`
- Auth: Bearer token required
- Query parameters: `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Result Batch

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/result-batches`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "examId": "",
  "title": "Annual Results 2025-26",
  "description": ""
}
```

#### Publish Result Batch

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/result-batches/:id/publish`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Public Result Token

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/result-batches/:id/public-token`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Public Result (no auth)

- Method: `GET`
- URL: `{{base_url}}/api/results/public?token=`
- Auth: No bearer token in request headers
- Query parameters: `token`
- Environment variables: `{{base_url}}`

### 🎓 Academics / Certificates

#### Issue Certificate

- Method: `POST`
- URL: `{{base_url}}/api/admin/academics/certificates`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "studentId": "",
  "type": "BONAFIDE",
  "templateId": "",
  "remarks": ""
}
```

#### List Certificates

- Method: `GET`
- URL: `{{base_url}}/api/admin/academics/certificates?studentId=`
- Auth: Bearer token required
- Query parameters: `studentId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

### ⚙️ Settings

#### List Tenants (Platform)

- Method: `GET`
- URL: `{{base_url}}/api/platform/tenants`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`

#### Get Tenant

- Method: `GET`
- URL: `{{base_url}}/api/tenants/:tenantId`
- Auth: Bearer token required
- Path parameters: `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`

#### Create Tenant (Platform)

- Method: `POST`
- URL: `{{base_url}}/api/platform/tenants`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`
- Example body:
```json
{
  "name": "Demo School",
  "slug": "demo-school"
}
```

#### Finalize Tenant

- Method: `POST`
- URL: `{{base_url}}/api/platform/tenants/:tenantId/finalize`
- Auth: Bearer token required
- Path parameters: `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`
- Example body:
```json
{
  "planId": "BASIC"
}
```

#### List Campuses

- Method: `GET`
- URL: `{{base_url}}/api/tenants/:tenantId/campuses`
- Auth: Bearer token required
- Path parameters: `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Campus

- Method: `POST`
- URL: `{{base_url}}/api/tenants/:tenantId/campuses`
- Auth: Bearer token required
- Path parameters: `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Main Campus",
  "code": "MAIN",
  "type": "SCHOOL",
  "city": "Bengaluru",
  "state": "Karnataka"
}
```

#### List Programs

- Method: `GET`
- URL: `{{base_url}}/api/admin/programs`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Program

- Method: `POST`
- URL: `{{base_url}}/api/admin/programs`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "CBSE K-12",
  "type": "SCHOOL",
  "campusId": "{{campus_id}}"
}
```

#### List Academic Years

- Method: `GET`
- URL: `{{base_url}}/api/tenants/:tenantId/academic-years`
- Auth: Bearer token required
- Path parameters: `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Academic Year

- Method: `POST`
- URL: `{{base_url}}/api/tenants/:tenantId/academic-years`
- Auth: Bearer token required
- Path parameters: `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "25-26",
  "startDate": "2025-06-01",
  "endDate": "2026-05-31",
  "isCurrent": true
}
```

#### Set Active Academic Year

- Method: `POST`
- URL: `{{base_url}}/api/tenants/:tenantId/academic-years/:id/activate`
- Auth: Bearer token required
- Path parameters: `id`, `tenantId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Tenant Features

- Method: `GET`
- URL: `{{base_url}}/api/admin/features`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Update Tenant Features

- Method: `PATCH`
- URL: `{{base_url}}/api/admin/features`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "onlinePayments": true,
  "certificates": true,
  "studentPortal": true
}
```

#### List Templates

- Method: `GET`
- URL: `{{base_url}}/api/templates`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Template

- Method: `POST`
- URL: `{{base_url}}/api/templates`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "name": "Bonafide Certificate",
  "type": "CERTIFICATE"
}
```

#### Publish Template Version

- Method: `POST`
- URL: `{{base_url}}/api/templates/:id/publish`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{studentName}}`, `{{tenant_id}}`
- Example body:
```json
{
  "content": "<p>This is to certify that {{studentName}} is a bonafide student.</p>",
  "variables": ["studentName", "admissionNo", "class", "academicYear"]
}
```

#### Dashboard Overview

- Method: `GET`
- URL: `{{base_url}}/api/dashboard`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Super Admin Overview

- Method: `GET`
- URL: `{{base_url}}/api/platform/overview`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`

### 📢 Comms

#### List Announcements

- Method: `GET`
- URL: `{{base_url}}/api/admin/announcements`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Announcement

- Method: `POST`
- URL: `{{base_url}}/api/admin/announcements`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "title": "Holiday Notice",
  "body": "College will remain closed on 15th Aug",
  "targetGroup": "ALL",
  "campusId": "{{campus_id}}"
}
```

#### Publish Announcement

- Method: `POST`
- URL: `{{base_url}}/api/admin/announcements/:id/publish`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Events

- Method: `GET`
- URL: `{{base_url}}/api/admin/events`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Event

- Method: `POST`
- URL: `{{base_url}}/api/admin/events`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "title": "Annual Day",
  "date": "2026-12-15",
  "description": "Annual cultural event",
  "campusId": "{{campus_id}}"
}
```

#### List Leave Requests

- Method: `GET`
- URL: `{{base_url}}/api/admin/leave`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Create Leave Request

- Method: `POST`
- URL: `{{base_url}}/api/admin/leave`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "type": "CASUAL",
  "fromDate": "2026-05-10",
  "toDate": "2026-05-12",
  "reason": "Personal work"
}
```

#### Approve/Reject Leave

- Method: `POST`
- URL: `{{base_url}}/api/admin/leave/:id/approve`
- Auth: Bearer token required
- Path parameters: `id`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "action": "APPROVED",
  "remarks": ""
}
```

### 🗓 Timetable

#### Get Section Timetable

- Method: `GET`
- URL: `{{base_url}}/api/timetable?classId=&sectionId=&academicYearId=`
- Auth: Bearer token required
- Query parameters: `classId`, `sectionId`, `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Get Teacher Timetable

- Method: `GET`
- URL: `{{base_url}}/api/timetable/teacher?teacherId=&academicYearId=`
- Auth: Bearer token required
- Query parameters: `teacherId`, `academicYearId`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Replace Section Timetable

- Method: `PUT`
- URL: `{{base_url}}/api/timetable`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "classId": "",
  "sectionId": "",
  "campusId": "{{campus_id}}",
  "academicYearId": "",
  "slots": [
    { "day": "MON", "period": 1, "subjectId": "", "subjectName": "Mathematics", "teacherId": "", "teacherName": "Mr. Sharma", "startTime": "09:00", "endTime": "09:45" }
  ]
}
```

### 📁 Storage

#### Get Upload URL

- Method: `POST`
- URL: `{{base_url}}/api/storage/upload-url`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "fileName": "student-photo.jpg",
  "contentType": "image/jpeg",
  "folder": "student-docs"
}
```

#### Get Download URL

- Method: `GET`
- URL: `{{base_url}}/api/storage/download-url?key={{upload_key}}`
- Auth: Bearer token required
- Query parameters: `key`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`, `{{upload_key}}`

### 🔍 Audit & Cleanup

#### List Audit Logs

- Method: `GET`
- URL: `{{base_url}}/api/audit-logs?limit=50&entityType=`
- Auth: Bearer token required
- Query parameters: `limit`, `entityType`
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### List Platform Audit Logs

- Method: `GET`
- URL: `{{base_url}}/api/platform/audit-logs?limit=50`
- Auth: Bearer token required
- Query parameters: `limit`
- Environment variables: `{{access_token}}`, `{{base_url}}`

#### Duplicate Student Report

- Method: `GET`
- URL: `{{base_url}}/api/admin/cleanup/duplicate-students`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`

#### Merge Students

- Method: `POST`
- URL: `{{base_url}}/api/admin/cleanup/merge-students`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "primaryStudentId": "",
  "duplicateStudentIds": ["", ""]
}
```

#### Merge Enquiries

- Method: `POST`
- URL: `{{base_url}}/api/admin/cleanup/merge-enquiries`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{base_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "primaryEnquiryId": "",
  "duplicateEnquiryIds": ["", ""]
}
```

### 🔗 AppSync GraphQL

#### Promote Students

- Method: `POST`
- URL: `{{appsync_url}}`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{appsync_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "query": "mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"\",\"toAcademicYearId\":\"\",\"campusId\":\"{{campus_id}}\",\"fromGradeId\":\"\",\"toGradeId\":\"\",\"studentIds\":[\"\"],\"sectionStrategy\":\"SAME_SECTION\",\"eligibilityMode\":\"USE_ENROLLMENT_ELIGIBILITY\",\"feeAction\":\"SKIP\",\"allowPendingFee\":false}"
  }
}
```

#### Set Promotion Eligibility

- Method: `POST`
- URL: `{{appsync_url}}`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{appsync_url}}`, `{{tenant_id}}`
- Example body:
```json
{
  "query": "mutation SetStudentPromotionEligibility($input: AWSJSON!) { setStudentPromotionEligibility(input: $input) }",
  "variables": {
    "input": "{\"academicYearId\":\"\",\"updates\":[{\"studentId\":\"\",\"eligibility\":\"ELIGIBLE\"}]}"
  }
}
```

#### List Promotion Batches

- Method: `POST`
- URL: `{{appsync_url}}`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{appsync_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "query": "query ListPromotionBatches($fromAcademicYearId: ID, $toAcademicYearId: ID, $campusId: ID, $fromGradeId: ID, $status: String) { listPromotionBatches(fromAcademicYearId: $fromAcademicYearId, toAcademicYearId: $toAcademicYearId, campusId: $campusId, fromGradeId: $fromGradeId, status: $status) }",
  "variables": {
    "fromAcademicYearId": "",
    "toAcademicYearId": "",
    "campusId": "{{campus_id}}",
    "fromGradeId": "",
    "status": ""
  }
}
```

#### Copy Fee Pattern to Next Year

- Method: `POST`
- URL: `{{appsync_url}}`
- Auth: Bearer token required
- Environment variables: `{{access_token}}`, `{{appsync_url}}`, `{{campus_id}}`, `{{tenant_id}}`
- Example body:
```json
{
  "query": "mutation CopyFeePatternToNextYear($input: AWSJSON!) { copyFeePatternToNextYear(input: $input) }",
  "variables": {
    "input": "{\"fromAcademicYearId\":\"\",\"toAcademicYearId\":\"\",\"campusId\":\"{{campus_id}}\",\"fromGradeId\":\"\",\"toGradeId\":\"\",\"feeCategoryId\":\"\",\"activateCopies\":false}"
  }
}
```

### ❤️ Health

#### Health Check

- Method: `GET`
- URL: `{{base_url}}/api/health`
- Auth: No bearer token in request headers
- Environment variables: `{{base_url}}`

