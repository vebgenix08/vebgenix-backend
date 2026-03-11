# Project Refactoring Changelog (Phases 1-6)

## 1. Architecture Overhaul
- **Deprecated**: Express monolith (`server/src/interfaces/http`).
- **Adopted**: Serverless Domain-Driven Design (DDD).
  - **Entry Point**: AWS AppSync -> NodejsFunction (Lambda).
  - **Domain Logic**: `server/src/domain` (Pure TS).
  - **Infrastructure**: `aws-infrastructure` (CDK).

## 2. Database Schema (`prisma/schema.prisma`)
### New Models
- **Identity**: `RoleDefinition`, `RolePermission`, `MemberRole`, `StudentAuthLink`.
- **Academic**: `AcademicYear`, `Program`, `Class`, `Section`.
- **Settings**: `Template`, `TemplateVersion`.
- **Admissions**: `Applicant`, `AdmissionOffer`.
- **Finance**: `FeeHead`, `FeeStructure`, `FeeStructureVersion`, `StudentFeeAssignment`.

### Updated Models
- **TenantMembership**: Added `isPrimaryAdmin`, deprecated `role` enum.
- **Application**: Added `applicantId`, `academicYearId`.
- **Tenant**: Added relations to new models.
- **Student**: Added `feeAssignments` relation.

## 3. Domain Logic Implementation (`server/src`)
### Identity Domain
- **`IdentityService`**: "God Function" for resolving User + Tenant + Permissions context.
- **`StaffService`**: Staff listing and detail retrieval with scope enforcement.
- **`Policies`**: Access control rules (e.g., cannot remove owner).

### Admissions Domain
- **`AdmissionsService`**: Enquiry creation, Application submission.
- **`ApplicantService`**: Deduplication logic (Phone/Email).
- **`ApplicationWorkflow`**: State machine for application status transitions.

### Settings Domain
- **`AcademicService`**: Managing academic years.
- **`TemplateService`**: Managing document/fee templates.

### Finance Domain
- **`FinanceService`**: Creating fee heads and structures.

### Student Domain
- **`StudentService`**: Listing students.
- **`ConversionService`**: Transactional conversion of Application -> Student.

## 4. GraphQL API (`server/src/interfaces/graphql`)
### New Resolvers
- **`identity/users.ts`**: `listUsers`, `inviteStaff`.
- **`admissions/handler.ts`**: `createAdmission` (Enquiry), `submitAdmission`.
- **`settings/handler.ts`**: `createAcademicYear`, `createTemplate`.
- **`students/handler.ts`**: `listStudents`, `convertApplicationToStudent`.
- **`finance/handler.ts`**: `createFeeHead`, `createFeeStructure`.

## 5. Infrastructure (`aws-infrastructure`)
### AppSync Stack
- **`makeDomainLambda`**: New helper to deploy TypeScript Lambdas directly from `server/src`.
- **New Lambdas**: `SettingsLambda`, `StudentsLambda`, `FinanceLambda` added.
- **Resolvers**: Wired up all new GraphQL mutations and queries.

### Async Stack
- **Event Bus**: `vebgenix-dev` bus for async events.
- **Workers**: `EmailWorker` and `JobsWorker` stubs created.

## 6. How to Deploy
1.  **Install Dependencies**: `npm install` in `server/`.
2.  **Generate Client**: `npx prisma generate` in `server/`.
3.  **Deploy**: `cd aws-infrastructure && npx cdk deploy --all -c env=dev`.
