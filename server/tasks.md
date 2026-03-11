# Vebgenix Implementation Tasks

This file tracks the implementation progress of the Vebgenix ERP backend refactoring and feature development.

## Phase 1: Foundation (Completed)
- [x] **Schema Alignment**: Updated `prisma/schema.prisma`
    - Added `RoleDefinition`, `RolePermission`, `MemberRole`
    - Added `StudentAuthLink`
    - Updated `TenantMembership` (deprecated `role` enum)
- [x] **Domain Structure**: Created `server/src/domain` structure
    - `identity/`: Entities, Services, Policies
    - `admissions/`: Entities, Workflows
    - `shared/`: Errors, Result types
- [x] **Core Services**: Implemented `IdentityService`
    - `getContext()`: Resolves User + Membership + Permissions + Campus Scope
- [x] **Workflow**: Defined `ApplicationWorkflow` state machine
- [x] **Documentation**: Added `README_ARCH.md`

## Phase 2: Staff & Access (Completed)
- [x] **Domain Service**: Implemented `StaffService`
    - `listStaff`, `getStaffDetails` with scope enforcement
- [x] **Application Use Cases**: Implemented Orchestrators
    - `InviteStaff`: AuthUser creation, Membership, Profile, Transaction
    - `AssignRole`: Manage MemberRoles
- [x] **GraphQL Interface**:
    - Created `server/src/interfaces/graphql/identity/users.ts`
    - Created `server/src/interfaces/graphql/context.ts`
- [x] **AppSync Schema**: Updated `schema.graphql` with `User`, `InviteStaff` types
- [x] **Infrastructure**:
    - Updated `AppSyncStack` to use `NodejsFunction` pointing to `server/src`
    - Updated `client.ts` to handle Secrets Manager fetching

## Phase 3: Academic Configuration (Completed)
- [x] **Schema**: Add `AcademicYear`, `Program`, `Class`, `Section`
- [x] **Schema**: Add `Template`, `TemplateVersion`
- [x] **Domain**: `TemplateService` and `AcademicService`
- [x] **GraphQL**: `settings/handler.ts` resolvers
- [x] **Infra**: Added `SettingsLambda` to `AppSyncStack`

## Phase 4: Admissions Workflow (Completed)
- [x] **Schema**: Add `Applicant` (deduplication) and `AdmissionOffer`
- [x] **Domain**: Implement `AdmissionsService` using `ApplicationWorkflow`
- [x] **Use Cases**: `SubmitApplication`
- [x] **GraphQL**: `admissions/handler.ts` resolvers
- [x] **Infra**: Updated `AdmissionsLambda` to use `makeDomainLambda`

## Phase 5: Student & Finance (Core Logic Completed)
- [x] **Schema**: Add `FeeStructure`, `FeeSnapshot`, `FeeAssignment`
- [x] **Domain**: `StudentService` and `FinanceService`
- [x] **Transaction**: `ConversionService` (Application -> Student + Enrollment + Fee)
- [ ] **GraphQL**: `students` and `finance` modules
- [ ] **Infra**: Add `FinanceLambda` and `StudentLambda`

## Phase 6: Portal & Async
- [ ] **Async**: Setup EventBridge patterns for Email/PDF
- [ ] **Portal**: Implement `StudentAuthLink` login flow in `IdentityService`
