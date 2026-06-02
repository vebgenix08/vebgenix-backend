# Backend API Reference

Purpose: manual lookup for APIs, handlers, routes, use-cases, repositories, models, permissions, and storage behavior.

Receipt PDF rule: generated on demand only. It is not stored in S3 or DB.

## Finance APIs

### Fee Head
Feature: Fee Head
Module: Finance
API names: listFeeHeads, getFeeHead, createFeeHead, updateFeeHead, deleteFeeHead
API type: Query / Mutation
GraphQL field or endpoint: `listFeeHeads`, `getFeeHead`, `createFeeHead`, `updateFeeHead`, `deleteFeeHead`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/fee-head.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/fee-head.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.listFeeHeadsFiltered`, `FinanceRepo.createFeeHead`, `FinanceRepo.updateFeeHead`, `FinanceRepo.deleteFeeHead`
DB model: `FeeHead`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB fee heads
Reads data from: MongoDB fee heads
Permission: `finance.read` / `finance.manage_setup`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Fee Schedule
Feature: Fee Schedule
Module: Finance
API names: listFeeSchedules, createFeeSchedule, updateFeeSchedule, deleteFeeSchedule, addScheduleSlot, deleteScheduleSlot
API type: Query / Mutation
GraphQL field or endpoint: `listFeeSchedules`, `createFeeSchedule`, `updateFeeSchedule`, `deleteFeeSchedule`, `addScheduleSlot`, `deleteScheduleSlot`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/fee-schedule.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/fee-schedule.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.listFeeSchedules`, `FinanceRepo.createFeeSchedule`, `FinanceRepo.updateFeeSchedule`, `FinanceRepo.deleteFeeSchedule`
DB model: `FeeSchedule`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB fee schedules
Reads data from: MongoDB fee schedules
Permission: `finance.read` / `finance.manage_setup`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Fee Structure
Feature: Fee Structure
Module: Finance
API names: listFeeStructures, getFeeStructure, createFeeStructure, updateFeeStructure, deleteFeeStructure, copyFeePatternToNextYear
API type: Query / Mutation
GraphQL field or endpoint: `listFeeStructures`, `getFeeStructure`, `createFeeStructure`, `updateFeeStructure`, `deleteFeeStructure`, `copyFeePatternToNextYear`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/fee-structure.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/fee-structure.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.listFeeStructures`, `FinanceRepo.createFeeStructure`, `FinanceRepo.updateFeeStructure`, `FinanceRepo.deleteFeeStructure`, `FinanceRepo.copyFeePatternToNextYear`
DB model: `FeeStructure`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB fee structures
Reads data from: MongoDB fee structures
Permission: `finance.read` / `finance.manage_setup`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Fee Structure Mapping
Feature: Fee Structure Class Mapping
Module: Finance
API names: listFeeStructureClassMappings, getFeeStructureClassMapping, createFeeStructureClassMapping, bulkCreateFeeStructureClassMappings, updateFeeStructureClassMapping, deleteFeeStructureClassMapping
API type: Query / Mutation
GraphQL field or endpoint: `listFeeStructureClassMappings`, `getFeeStructureClassMapping`, `createFeeStructureClassMapping`, `bulkCreateFeeStructureClassMappings`, `updateFeeStructureClassMapping`, `deleteFeeStructureClassMapping`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/fee-structure-mapping.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/fee-structure-mapping.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.listFeeStructureClassMappings`, `FinanceRepo.createFeeStructureClassMapping`, `FinanceRepo.bulkCreateFeeStructureClassMappings`, `FinanceRepo.updateFeeStructureClassMapping`, `FinanceRepo.deleteFeeStructureClassMapping`
DB model: `FeeStructureClassMapping`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB fee structure mappings
Reads data from: MongoDB fee structure mappings
Permission: `finance.read` / `finance.manage_setup`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Fee Assignment
Feature: Fee Assignment
Module: Finance
API names: listFeeAssignments, getFeeAssignment, getStudentFeeAssignment, createFeeAssignment, bulkAssignFeeStructure, getFeeAssignmentQueue, getAssignableFeeStructures
API type: Query / Mutation
GraphQL field or endpoint: `listFeeAssignments`, `getFeeAssignment`, `getStudentFeeAssignment`, `createFeeAssignment`, `bulkAssignFeeStructure`, `getFeeAssignmentQueue`, `getAssignableFeeStructures`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/fee-assignment.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/fee-assignment.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.listFeeAssignments`, `FinanceRepo.getStudentFeeAssignment`, `FinanceRepo.createFeeAssignment`, `FinanceRepo.bulkAssignFeeStructure`
DB model: `FeeAssignment`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB fee assignments
Reads data from: MongoDB fee assignments
Permission: `finance.read` / `finance.manage_setup`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Student Fee Order
Feature: Student Fee Order
Module: Finance
API names: listStudentFeeOrders, getStudentFeeOrder, generateStudentFeeOrders, updateStudentFeeOrder, cancelStudentFeeOrder
API type: Query / Mutation
GraphQL field or endpoint: `listStudentFeeOrders`, `getStudentFeeOrder`, `generateStudentFeeOrders`, `updateStudentFeeOrder`, `cancelStudentFeeOrder`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/student-order.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/student-order.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts), [apps/finance-service/src/numbering.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/numbering.ts)
Repository method: `FinanceRepo.listStudentOrders`, `FinanceRepo.getStudentOrderById`, `FinanceRepo.updateStudentOrder`
DB model: `StudentFeeOrder`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB student fee orders
Reads data from: MongoDB student fee orders
Permission: `finance.read`, `finance.manage_setup`, `finance.admin`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Invoice
Feature: Invoice
Module: Finance
API names: listInvoices, getInvoice, getStudentInvoices, updateInvoice, cancelInvoice, reviseInvoice, createOneOffCharge, bulkCreateCharge, generatePaymentLink
API type: Query / Mutation
GraphQL field or endpoint: `listInvoices`, `getInvoice`, `getStudentInvoices`, `updateInvoice`, `cancelInvoice`, `reviseInvoice`, `createOneOffCharge`, `bulkCreateCharge`, `generatePaymentLink`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/invoice.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/invoice.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts), [apps/finance-service/src/numbering.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/numbering.ts), [apps/finance-service/src/razorpay.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/razorpay.ts)
Repository method: `FinanceRepo.listInvoices`, `FinanceRepo.findInvoiceById`, `FinanceRepo.findStudentInvoices`, `FinanceRepo.updateInvoice`, `FinanceRepo.cancelInvoice`, `FinanceRepo.reviseInvoice`, `FinanceRepo.createInvoice`, `FinanceRepo.bulkCreateCharge`
DB model: `Invoice`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB invoices
Reads data from: MongoDB invoices
Permission: `finance.read`, `finance.manage_invoice`, `finance.collect_payment`
Tenant required: Yes
Audit log: Writes should be audited
External service: Razorpay for payment link generation
File storage: No
Frontend usage: Needs verification
Status: Active

### Payment
Feature: Payment / Receipt
Module: Finance
API names: listPayments, getPayment, recordPayment, createPaymentOrder, verifyPaymentSignature, collectPaymentByStudent, listReceipts, getReceipt, generateReceiptPdf, POST:/api/webhook/razorpay, POST:/api/finance/payments/create-order, POST:/api/finance/payments/verify, GET:/api/admin/finance/receipts, GET:/api/admin/finance/receipts/:id, POST:/api/admin/finance/students/:studentId/collect
API type: Query / Mutation / Webhook / REST
GraphQL field or endpoint: `listPayments`, `getPayment`, `recordPayment`, `createPaymentOrder`, `verifyPaymentSignature`, `collectPaymentByStudent`, `listReceipts`, `getReceipt`, `generateReceiptPdf`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/payment.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/payment.ts)
Helper file, if any: [apps/finance-service/src/razorpay.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/razorpay.ts), [apps/finance-service/src/numbering.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/numbering.ts), [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.listPayments`, `FinanceRepo.findPaymentById`, `FinanceRepo.findPaymentByRazorpayOrderId`, `FinanceRepo.listStudentOrders`
DB model: `Payment`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB payments; receipt number on payment record
Reads data from: MongoDB payments, invoices, student fee orders
Permission: `finance.read`, `finance.collect_payment`
Tenant required: Yes
Audit log: Writes should be audited
External service: Razorpay; webhook signature verification; receipt PDF generated on demand only
File storage: Generated on demand, not stored
Frontend usage: Needs verification
Status: Active
Notes: `generateReceiptPdf` is exposed in schema, but route wiring should be verified.

### Transaction
Feature: Student Transaction / Reports
Module: Finance
API names: listStudentTransactions, getStudentTransaction, createStudentTransaction, dayBookReport, feeCollectionAnalytics, classFeeStats, studentFinancialSummary, outstandingReport, getFeeRevisions, getStudentDues
API type: Query / Mutation
GraphQL field or endpoint: `listStudentTransactions`, `getStudentTransaction`, `createStudentTransaction`, `dayBookReport`, `feeCollectionAnalytics`, `classFeeStats`, `studentFinancialSummary`, `outstandingReport`, `getFeeRevisions`, `getStudentDues`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/transaction.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/transaction.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts), [apps/finance-service/src/numbering.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/numbering.ts)
Repository method: `FinanceRepo.listTransactions`, `FinanceRepo.getTransactionById`, `FinanceRepo.createTransaction`, `FinanceRepo.dayBookReport`, `FinanceRepo.feeCollectionAnalytics`, `FinanceRepo.classFeeStats`, `FinanceRepo.studentFinancialSummary`, `FinanceRepo.getFeeRevisions`, `FinanceRepo.getStudentDues`
DB model: `StudentTransaction`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB transactions and finance analytics responses
Reads data from: MongoDB transactions, invoices, fee orders, revisions
Permission: `finance.read`, `finance.collect_payment`, `finance.reports`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Reports / Dues
Feature: Finance Reports and Student Dues
Module: Finance
API names: dayBookReport, feeCollectionAnalytics, classFeeStats, studentFinancialSummary, outstandingReport, getFeeRevisions, getStudentDues
API type: Query
GraphQL field or endpoint: `dayBookReport`, `feeCollectionAnalytics`, `classFeeStats`, `studentFinancialSummary`, `outstandingReport`, `getFeeRevisions`, `getStudentDues`
Lambda/service: finance-service
Handler: [apps/finance-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/handler.ts)
Route file: [apps/finance-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/routes.ts)
Use-case file: [apps/finance-service/src/use-cases/transaction.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/use-cases/transaction.ts)
Helper file, if any: [apps/finance-service/src/finance-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/finance-service/src/finance-utils.ts)
Repository method: `FinanceRepo.dayBookReport`, `FinanceRepo.feeCollectionAnalytics`, `FinanceRepo.classFeeStats`, `FinanceRepo.studentFinancialSummary`, `FinanceRepo.getFeeRevisions`, `FinanceRepo.getStudentDues`
DB model: `Payment`, `Invoice`, `StudentFeeOrder`
DB collection: Mongoose default collection, needs verification
Stores data in: Not stored, computed report responses only
Reads data from: MongoDB payments, invoices, fee orders, and revisions
Permission: `finance.read` / `finance.reports`
Tenant required: Yes
Audit log: Read only
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

## Academics APIs

### Classes
Feature: Classes
Module: Academics
API names: listClasses, getClass, createClass, updateClass, deleteClass
API type: Query / Mutation
GraphQL field or endpoint: `listClasses`, `getClass`, `createClass`, `updateClass`, `deleteClass`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/classes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/classes.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listClasses`, `AcademicsRepo.findClassById`, `AcademicsRepo.createClass`, `AcademicsRepo.updateClass`, `AcademicsRepo.deleteClass`
DB model: `GradeClass`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB classes
Reads data from: MongoDB classes
Permission: `academics.classes.create`, `academics.classes.update`, `academics.classes.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Sections
Feature: Sections
Module: Academics
API names: listAllSections, getSection, listSectionStudents, listSectionCourses, createSection, updateSection, deleteSection, setSectionIncharge, assignSectionCourse, removeSectionCourse
API type: Query / Mutation
GraphQL field or endpoint: `listAllSections`, `getSection`, `listSectionStudents`, `listSectionCourses`, `createSection`, `updateSection`, `deleteSection`, `setSectionIncharge`, `assignSectionCourse`, `removeSectionCourse`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/sections.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/sections.ts), [apps/academics-service/src/use-cases/students.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/students.ts), [apps/academics-service/src/use-cases/subjects.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/subjects.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listSections`, `AcademicsRepo.findSectionById`, `AcademicsRepo.createSection`, `AcademicsRepo.updateSection`, `AcademicsRepo.deleteSection`, `SubjectAllocation` helpers
DB model: `SectionRecord`, `SubjectAllocation`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB sections and allocations
Reads data from: MongoDB sections, students, allocations
Permission: `academics.sections.create`, `academics.sections.update`, `academics.sections.delete`, `academics.allocations.create`, `academics.allocations.update`, `academics.allocations.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Subjects
Feature: Subjects
Module: Academics
API names: listSubjects, getSubject, createSubject, updateSubject, deleteSubject, listSectionCourses, assignSectionCourse, updateSectionCourse, removeSectionCourse
API type: Query / Mutation
GraphQL field or endpoint: `listSubjects`, `getSubject`, `createSubject`, `updateSubject`, `deleteSubject`, `listSectionCourses`, `assignSectionCourse`, `updateSectionCourse`, `removeSectionCourse`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/subjects.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/subjects.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listSubjects`, `AcademicsRepo.findSubjectById`, `AcademicsRepo.createSubject`, `AcademicsRepo.updateSubject`, `AcademicsRepo.deleteSubject`, `SubjectAllocation` helpers
DB model: `SubjectRecord`, `SubjectAllocation`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB subjects and allocations
Reads data from: MongoDB subjects and allocations
Permission: `academics.subjects.create`, `academics.subjects.update`, `academics.subjects.delete`, `academics.allocations.create`, `academics.allocations.update`, `academics.allocations.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Students
Feature: Students
Module: Academics
API names: listStudents, getStudent, enrollStudent, updateStudent, updateStudentStatus, assignStudentClass, bulkAssignStudentsToClass, randomAssignStudentsToClass, convertApplicationToStudent, enablePortalAccess, enableStudentPortal, enableGuardianPortal, listSectionStudents
API type: Query / Mutation
GraphQL field or endpoint: `listStudents`, `getStudent`, `enrollStudent`, `updateStudent`, `updateStudentStatus`, `assignStudentClass`, `bulkAssignStudentsToClass`, `randomAssignStudentsToClass`, `convertApplicationToStudent`, `enablePortalAccess`, `enableStudentPortal`, `enableGuardianPortal`, `listSectionStudents`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/students.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/students.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listStudents`, `AcademicsRepo.findStudentById`, `AcademicsRepo.createStudent`, `AcademicsRepo.updateStudent`, `Student.updateMany`
DB model: `Student`, admissions lookup for conversion
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB students and enrollment data
Reads data from: MongoDB students and admissions applications for conversion
Permission: `students.enroll`, `students.status.update`, `academics.students.assign`, `students.portal.manage`
Tenant required: Yes
Audit log: Writes should be audited
External service: Cognito for portal enablement
File storage: No
Frontend usage: Needs verification
Status: Active

### Academic Numbers
Feature: Enrollment / Registration / Roll Numbers
Module: Academics
API names: listEnrollments, listRegistrationBatches, listRollNoBatches, generateRegistrationNumbers, freezeRegistrationNumbers, generateRollNumbers, freezeRollNumbers, assignStudentToSection, transferStudentSection
API type: Query / Mutation
GraphQL field or endpoint: `listEnrollments`, `listRegistrationBatches`, `listRollNoBatches`, `generateRegistrationNumbers`, `freezeRegistrationNumbers`, `generateRollNumbers`, `freezeRollNumbers`, `assignStudentToSection`, `transferStudentSection`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/academic-numbers.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/academic-numbers.ts)
Helper file, if any: [apps/academics-service/src/academic-numbering.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academic-numbering.ts), [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listEnrollments`, `AcademicsRepo.listRegistrationBatches`, `AcademicsRepo.listRollNoBatches`, `AcademicsRepo.createEnrollment`, `AcademicsRepo.updateEnrollment`, `AcademicsRepo.updateStudent`
DB model: `Enrollment`, `RegistrationBatch`, `RollNoBatch`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB enrollments and numbering batches
Reads data from: MongoDB enrollments and students
Permission: `academics.enrollment.read`, `academics.enrollment.create`, `academics.enrollment.transfer`, `academics.registration.generate`, `academics.registration.freeze`, `academics.rollno.generate`, `academics.rollno.freeze`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Attendance
Feature: Attendance
Module: Academics
API names: listAttendance, getSectionAttendance, getSectionAttendanceSummary, getClassAttendance, getStudentAttendance, getAttendanceSummary, markSectionAttendance, markClassAttendance
API type: Query / Mutation
GraphQL field or endpoint: `listAttendance`, `getSectionAttendance`, `getSectionAttendanceSummary`, `getClassAttendance`, `getStudentAttendance`, `getAttendanceSummary`, `markSectionAttendance`, `markClassAttendance`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/attendance.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/attendance.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AttendanceRecord` model queries
DB model: `AttendanceRecord`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB attendance records
Reads data from: MongoDB attendance records and student roster data
Permission: `academics.attendance.mark` for writes; read permission needs verification
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Exams
Feature: Exams / Marks / Results
Module: Academics
API names: listExams, getExam, listResults, getExamResults, getExamStats, getMarksStatus, createExam, updateExam, deleteExam, enterMarks, publishResults
API type: Query / Mutation
GraphQL field or endpoint: `listExams`, `getExam`, `listResults`, `getExamResults`, `getExamStats`, `getMarksStatus`, `createExam`, `updateExam`, `deleteExam`, `enterMarks`, `publishResults`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/exams.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/exams.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listExams`, `AcademicsRepo.findExamById`, `AcademicsRepo.createExam`, `AcademicsRepo.updateExam`, `AcademicsRepo.deleteExam`, `AcademicsRepo.listResults`, `AcademicsRepo.getExamStats`, `AcademicsRepo.getMarksStatus`
DB model: `ExamRecord`, `ExamResultEntry`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB exams and result entries
Reads data from: MongoDB exams and result entries
Permission: `academics.exams.read`, `academics.exams.update`, `academics.exams.delete`, `academics.results.read`, `academics.results.create`, `academics.results.publish`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Timetable
Feature: Timetable
Module: Academics
API names: getSectionTimetable, getTeacherTimetable, getTeacherWorkload, replaceSectionTimetable
API type: Query / Mutation
GraphQL field or endpoint: `getSectionTimetable`, `getTeacherTimetable`, `getTeacherWorkload`, `replaceSectionTimetable`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/timetable.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/timetable.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `Timetable` model queries and updates
DB model: `Timetable`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB section timetables
Reads data from: MongoDB timetables and teacher assignment data
Permission: `academics.timetable.read`, `academics.timetable.manage`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Certificates
Feature: Certificates
Module: Academics
API names: listCertificates, issueCertificate, approveCertificate
API type: Query / Mutation
GraphQL field or endpoint: `listCertificates`, `issueCertificate`, `approveCertificate`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/certificates.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/certificates.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listCertificates`, `AcademicsRepo.issueCertificate`, `AcademicsRepo.approveCertificate`
DB model: `Certificate`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB certificates
Reads data from: MongoDB certificates
Permission: `students.certificates.create`, `students.certificates.approve`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Promotions
Feature: Promotions
Module: Academics
API names: listPromotionBatches, getPromotionBatch, listPromotionBatchItems, promoteStudents, setStudentPromotionEligibility
API type: Query / Mutation
GraphQL field or endpoint: `listPromotionBatches`, `getPromotionBatch`, `listPromotionBatchItems`, `promoteStudents`, `setStudentPromotionEligibility`
Lambda/service: academics-service
Handler: [apps/academics-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/handler.ts)
Route file: [apps/academics-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/routes.ts)
Use-case file: [apps/academics-service/src/use-cases/promotions.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/use-cases/promotions.ts)
Helper file, if any: [apps/academics-service/src/academics-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/academics-service/src/academics-utils.ts)
Repository method: `AcademicsRepo.listPromotionBatches`, `AcademicsRepo.getPromotionBatch`, `AcademicsRepo.listPromotionBatchItems`, `AcademicsRepo.createPromotionBatch`, `AcademicsRepo.updatePromotionBatch`
DB model: `PromotionBatch`, `PromotionBatchItem`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB promotion batches and items
Reads data from: MongoDB promotion batches, items, and fee structures
Permission: `academics.promotion.read`, `academics.promotion.create`
Tenant required: Yes
Audit log: Writes should be audited
External service: Finance service for promotion-linked fee generation
File storage: No
Frontend usage: Needs verification
Status: Active

## Admissions APIs

### Enquiries
Feature: Enquiries
Module: Admissions
API names: listEnquiries, getEnquiry, createPublicEnquiry, createEnquiry, updateEnquiry, deleteEnquiry, checkDuplicate
API type: Query / Mutation
GraphQL field or endpoint: `listEnquiries`, `getEnquiry`, `createPublicEnquiry`, `createEnquiry`, `updateEnquiry`, `deleteEnquiry`, `checkDuplicate`
Lambda/service: admissions-service
Handler: [apps/admissions-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/handler.ts)
Route file: [apps/admissions-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/routes.ts)
Use-case file: [apps/admissions-service/src/use-cases/enquiries.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/use-cases/enquiries.ts)
Helper file, if any: [apps/admissions-service/src/admissions-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-utils.ts)
Repository method: `AdmissionsRepo.listEnquiries`, `AdmissionsRepo.findEnquiryById`, `AdmissionsRepo.createEnquiry`, `AdmissionsRepo.updateEnquiry`, `AdmissionsRepo.deleteEnquiry`
DB model: `Enquiry`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB enquiries
Reads data from: MongoDB enquiries and students for duplicate checks
Permission: `admissions.enquiry.read`, `admissions.enquiry.create`, `admissions.enquiry.update`, `admissions.enquiry.delete`
Tenant required: Yes for tenant-scoped APIs; public enquiry uses tenant input
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Applications
Feature: Applications
Module: Admissions
API names: listApplications, getApplication, createApplication, updateApplication, submitApplication, withdrawApplication, updateApplicationStatus
API type: Query / Mutation
GraphQL field or endpoint: `listApplications`, `getApplication`, `createApplication`, `updateApplication`, `submitApplication`, `withdrawApplication`, `updateApplicationStatus`
Lambda/service: admissions-service
Handler: [apps/admissions-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/handler.ts)
Route file: [apps/admissions-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/routes.ts)
Use-case file: [apps/admissions-service/src/use-cases/applications.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/use-cases/applications.ts)
Helper file, if any: [apps/admissions-service/src/admissions-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-utils.ts), [apps/admissions-service/src/admissions-numbering.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-numbering.ts)
Repository method: `AdmissionsRepo.listApplications`, `AdmissionsRepo.findApplicationById`, `AdmissionsRepo.createApplication`, `AdmissionsRepo.updateApplication`
DB model: `Application`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB applications
Reads data from: MongoDB applications and enquiries
Permission: `admissions.application.read`, `admissions.application.create`, `admissions.application.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Application Review
Feature: Application Review / Approval Queue
Module: Admissions
API names: getApprovalQueue, getApplicationReviews, reviewApplication, approveApplication, rejectApplication
API type: Query / Mutation
GraphQL field or endpoint: `getApprovalQueue`, `getApplicationReviews`, `reviewApplication`, `approveApplication`, `rejectApplication`
Lambda/service: admissions-service
Handler: [apps/admissions-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/handler.ts)
Route file: [apps/admissions-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/routes.ts)
Use-case file: [apps/admissions-service/src/use-cases/application-review.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/use-cases/application-review.ts)
Helper file, if any: [apps/admissions-service/src/admissions-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-utils.ts)
Repository method: `AdmissionsRepo.listApplications`, `AdmissionsRepo.updateApplication`
DB model: `ApplicationReview`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB application review records
Reads data from: MongoDB applications and review records
Permission: `admissions.application.review`, `admissions.application.read`, `admissions.application.approve`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Documents
Feature: Document Verification / Upload URL
Module: Admissions
API names: verifyDocument, getUploadUrl
API type: Mutation
GraphQL field or endpoint: `verifyDocument`, `getUploadUrl`
Lambda/service: admissions-service
Handler: [apps/admissions-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/handler.ts)
Route file: [apps/admissions-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/routes.ts)
Use-case file: [apps/admissions-service/src/use-cases/documents.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/use-cases/documents.ts)
Helper file, if any: [apps/admissions-service/src/admissions-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-utils.ts)
Repository method: `AdmissionsRepo.updateApplication`
DB model: `Application`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB application metadata; upload URL is generated only
Reads data from: MongoDB applications
Permission: `admissions.application.review`
Tenant required: Yes
Audit log: Writes should be audited
External service: Storage service for signed upload URLs
File storage: S3 signed upload URL
Frontend usage: Needs verification
Status: Active

### Admission Confirmation
Feature: Admission Confirmation
Module: Admissions
API names: createAdmission, updateAdmission, submitAdmission, reviewAdmission, withdrawAdmission, updateAdmissionStatus
API type: Mutation
GraphQL field or endpoint: `createAdmission`, `updateAdmission`, `submitAdmission`, `reviewAdmission`, `withdrawAdmission`, `updateAdmissionStatus`
Lambda/service: admissions-service
Handler: [apps/admissions-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/handler.ts)
Route file: [apps/admissions-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/routes.ts)
Use-case file: [apps/admissions-service/src/use-cases/admission-confirmation.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/use-cases/admission-confirmation.ts)
Helper file, if any: [apps/admissions-service/src/admissions-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-utils.ts)
Repository method: `AdmissionsRepo.createApplication`, `AdmissionsRepo.updateApplication`
DB model: `Application`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB applications
Reads data from: MongoDB applications
Permission: `admissions.application.create`, `admissions.application.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Reports
Feature: Admission Reports
Module: Admissions
API names: admissionsStats, listAdmissions, getAdmission
API type: Query
GraphQL field or endpoint: `admissionsStats`, `listAdmissions`, `getAdmission`
Lambda/service: admissions-service
Handler: [apps/admissions-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/handler.ts)
Route file: [apps/admissions-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/routes.ts)
Use-case file: [apps/admissions-service/src/use-cases/reports.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/use-cases/reports.ts)
Helper file, if any: [apps/admissions-service/src/admissions-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admissions-service/src/admissions-utils.ts)
Repository method: `AdmissionsRepo.listEnquiries`, `AdmissionsRepo.listApplications`
DB model: `Enquiry`, `Application`
DB collection: Mongoose default collection, needs verification
Stores data in: Not stored, computed report response only
Reads data from: MongoDB enquiries and applications
Permission: `admissions.enquiry.read`, `admissions.application.read`
Tenant required: Yes
Audit log: Read only
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

## Identity APIs

### Users
Feature: Users
Module: Identity
API names: me, listUsers, getUser, createUser, updateUser, deactivateUser, reactivateUser, bulkDeactivateUsers
API type: Query / Mutation
GraphQL field or endpoint: `me`, `listUsers`, `getUser`, `createUser`, `updateUser`, `deactivateUser`, `reactivateUser`, `bulkDeactivateUsers`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/users.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/users.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.listProfiles`, `IdentityRepo.findProfileById`, `IdentityRepo.findProfileByAuthUserId`, `IdentityRepo.createAuthUser`, `IdentityRepo.createProfile`, `IdentityRepo.updateProfile`, `IdentityRepo.deactivateProfile`
DB model: `Profile`, `AuthUser`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB auth users and profiles
Reads data from: MongoDB auth users and profiles
Permission: `users.create`, `users.update`, `users.delete`, `identity.users.update`, `identity.users.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: Cognito for auth user creation and sync
File storage: No
Frontend usage: Needs verification
Status: Active

### Staff
Feature: Staff
Module: Identity
API names: listStaff, getStaffMember, inviteStaff, resendInvite
API type: Query / Mutation
GraphQL field or endpoint: `listStaff`, `getStaffMember`, `inviteStaff`, `resendInvite`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/staff.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/staff.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts), Cognito invite helpers in invites.ts
Repository method: `IdentityRepo.listProfiles`, `IdentityRepo.findProfileById`, `IdentityRepo.findProfileByAuthUserId`, `IdentityRepo.updateProfile`
DB model: `Profile`, `Employee`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB staff profiles and employee linkage
Reads data from: MongoDB profiles and employees
Permission: `staff.invite`, `identity.users.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: Cognito for invitation / resend
File storage: No
Frontend usage: Needs verification
Status: Active

### Employees
Feature: Employees
Module: Identity
API names: listEmployees, getEmployee, updateEmployee
API type: Query / Mutation
GraphQL field or endpoint: `listEmployees`, `getEmployee`, `updateEmployee`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/employees.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/employees.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.listProfiles`, `IdentityRepo.findProfileById`, `IdentityRepo.updateProfile`
DB model: `EmployeeRecord`, `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB employee records and profile linkage
Reads data from: MongoDB employee records and profiles
Permission: `identity.staff.read`, `identity.staff.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Profile
Feature: Self Profile
Module: Identity
API names: updateMyProfile
API type: Mutation
GraphQL field or endpoint: `updateMyProfile`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/profile.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/profile.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.findProfileByAuthUserId`, `IdentityRepo.updateProfile`
DB model: `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB profile updates
Reads data from: MongoDB profile and membership data
Permission: Self-service; permission mapping needs verification
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Campus Access
Feature: Campus Access
Module: Identity
API names: listCampusAccess, addCampusAccess, removeCampusAccess
API type: Query / Mutation
GraphQL field or endpoint: `listCampusAccess`, `addCampusAccess`, `removeCampusAccess`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/campus-access.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/campus-access.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.findProfileById`, `IdentityRepo.updateProfile`
DB model: `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB campus-access links
Reads data from: MongoDB campus-access links
Permission: `identity.users.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Roles
Feature: Roles
Module: Identity
API names: listRoles, assignRole, removeRole
API type: Query / Mutation
GraphQL field or endpoint: `listRoles`, `assignRole`, `removeRole`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/roles.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/roles.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.findProfileById`, `IdentityRepo.updateProfile`
DB model: `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB role assignment data
Reads data from: MongoDB roles and profiles
Permission: `identity.roles.assign`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Needs verification
Notes: `listRoles` is present in schema, but the AppSync resolver stack should be verified.

### Impersonation
Feature: Impersonation
Module: Identity
API names: impersonateUser
API type: Mutation
GraphQL field or endpoint: `impersonateUser`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/impersonation.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/impersonation.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.findProfileById`
DB model: `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: Not stored; console/audit side effect only
Reads data from: MongoDB target profile
Permission: Platform admin only; mapping needs verification
Tenant required: No for platform admin flows
Audit log: Should be logged
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Uploads
Feature: Avatar / Tenant Logo Upload Keys
Module: Identity
API names: uploadAvatar, uploadTenantLogo
API type: Mutation
GraphQL field or endpoint: `uploadAvatar`, `uploadTenantLogo`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/uploads.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/uploads.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: None; generates upload keys only
DB model: None
DB collection: N/A
Stores data in: S3 signed upload key only
Reads data from: None
Permission: `tenant.settings.update`
Tenant required: Yes for tenant logo; avatar uses current tenant context
Audit log: No direct data write
External service: S3 signed upload key
File storage: S3 signed upload URL
Frontend usage: Needs verification
Status: Active

### Invites
Feature: Invite Acceptance
Module: Identity
API names: acceptInvite, POST:/api/auth/accept-invite
API type: Mutation / REST
GraphQL field or endpoint: `acceptInvite`, `POST:/api/auth/accept-invite`
Lambda/service: identity-service
Handler: [apps/identity-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/handler.ts)
Route file: [apps/identity-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/routes.ts)
Use-case file: [apps/identity-service/src/use-cases/invites.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/use-cases/invites.ts)
Helper file, if any: [apps/identity-service/src/identity-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/identity-service/src/identity-utils.ts)
Repository method: `IdentityRepo.findAuthUserByEmail`, `IdentityRepo.upsertByCognitoSub`
DB model: `AuthUser`, `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: Cognito user pool and MongoDB profile records
Reads data from: Cognito user pool and profiles
Permission: Public invite flow; mapping needs verification
Tenant required: Invite token carries tenant context
Audit log: Should be logged
External service: Cognito
File storage: No
Frontend usage: Needs verification
Status: Active

## Settings APIs

### Tenants
Feature: Tenants
Module: Settings
API names: listTenants, getTenant, validateSubdomain, createTenant, updateTenant, deactivateTenant, reactivateTenant, provisionTenant, requestTenantDeletion, confirmTenantDeletion, finalizeTenant
API type: Query / Mutation
GraphQL field or endpoint: `listTenants`, `getTenant`, `validateSubdomain`, `createTenant`, `updateTenant`, `deactivateTenant`, `reactivateTenant`, `provisionTenant`, `requestTenantDeletion`, `confirmTenantDeletion`, `finalizeTenant`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/tenants.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/tenants.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts), [apps/settings-service/src/cognito-tenant-admin.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/cognito-tenant-admin.ts)
Repository method: direct model access (`Tenant`, `TenantFeature`, `Profile`, `AcademicYear`, `Student`, `Application`, `Enquiry`, `Invoice`, `Payment`)
DB model: `Tenant`, `TenantFeature`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB tenants and tenant feature flags
Reads data from: MongoDB tenants, tenant features, profiles, and admin lookup data
Permission: `tenant.settings.update`; platform admin bypass for privileged flows
Tenant required: Yes for scoped flows; platform admin can access platform flows
Audit log: Writes should be audited
External service: Cognito for tenant-admin provisioning and invite flows
File storage: No
Frontend usage: Needs verification
Status: Active

### Onboarding
Feature: Onboarding
Module: Settings
API names: createFirstAdmin, finalizeOnboarding
API type: Mutation
GraphQL field or endpoint: `createFirstAdmin`, `finalizeOnboarding`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/onboarding.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/onboarding.ts)
Helper file, if any: [apps/settings-service/src/cognito-tenant-admin.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/cognito-tenant-admin.ts)
Repository method: direct model access (`Tenant`, `Profile`, `TenantFeature`)
DB model: `Tenant`, `Profile`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB onboarding records and first admin profile
Reads data from: MongoDB tenants and profiles
Permission: Platform admin or tenant provisioning access; needs verification
Tenant required: Yes
Audit log: Writes should be audited
External service: Cognito
File storage: No
Frontend usage: Needs verification
Status: Active

### Tenant Users
Feature: Tenant Users
Module: Settings
API names: listTenantUsers, provisionTenantUser, deleteTenantUser, resendTenantInvite
API type: Query / Mutation
GraphQL field or endpoint: `listTenantUsers`, `provisionTenantUser`, `deleteTenantUser`, `resendTenantInvite`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/tenant-users.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/tenant-users.ts)
Helper file, if any: [apps/settings-service/src/cognito-tenant-admin.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/cognito-tenant-admin.ts)
Repository method: direct model access (`Profile`, `Tenant`)
DB model: `Profile`, `Tenant`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB tenant-user profile links and Cognito invite state
Reads data from: MongoDB profiles and tenant records
Permission: `tenant.settings.update`
Tenant required: Yes / platform admin override
Audit log: Writes should be audited
External service: Cognito
File storage: No
Frontend usage: Needs verification
Status: Active

### Campuses
Feature: Campuses
Module: Settings
API names: listCampuses, getCampus, createCampus, updateCampus, deactivateCampus
API type: Query / Mutation
GraphQL field or endpoint: `listCampuses`, `getCampus`, `createCampus`, `updateCampus`, `deactivateCampus`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/campuses.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/campuses.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct model access (`Campus`)
DB model: `Campus`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB campuses
Reads data from: MongoDB campuses
Permission: `tenant.campuses.create`, `tenant.campuses.update`, `tenant.campuses.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Programs
Feature: Programs
Module: Settings
API names: listPrograms, getProgram, createProgram, updateProgram, deleteProgram
API type: Query / Mutation
GraphQL field or endpoint: `listPrograms`, `getProgram`, `createProgram`, `updateProgram`, `deleteProgram`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/programs.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/programs.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct model access (`Program`)
DB model: `Program`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB programs
Reads data from: MongoDB programs
Permission: `settings.programs.create`, `settings.programs.update`, `settings.programs.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Academic Years
Feature: Academic Years
Module: Settings
API names: listAcademicYears, getAcademicYear, createAcademicYear, updateAcademicYear, setActiveAcademicYear
API type: Query / Mutation
GraphQL field or endpoint: `listAcademicYears`, `getAcademicYear`, `createAcademicYear`, `updateAcademicYear`, `setActiveAcademicYear`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/academic-years.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/academic-years.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct model access (`AcademicYear`)
DB model: `AcademicYear`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB academic years and active-year flags
Reads data from: MongoDB academic years
Permission: `settings.academic_year.create`, `settings.academic_year.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Templates
Feature: Templates
Module: Settings
API names: listTemplates, getTemplate, createTemplate, updateTemplate, publishTemplateVersion, deleteTemplate
API type: Query / Mutation
GraphQL field or endpoint: `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `publishTemplateVersion`, `deleteTemplate`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/templates.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/templates.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct model access (`Template`, `TemplateVersion`)
DB model: `Template`, `TemplateVersion`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB templates and template versions
Reads data from: MongoDB templates
Permission: `settings.templates.create`, `settings.templates.update`, `settings.templates.publish`, `settings.templates.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Features
Feature: Tenant Feature Toggles
Module: Settings
API names: listAvailableFeatures, getTenantFeatures, updateTenantFeatures
API type: Query / Mutation
GraphQL field or endpoint: `listAvailableFeatures`, `getTenantFeatures`, `updateTenantFeatures`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/features.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/features.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct model access (`TenantFeature`)
DB model: `TenantFeature`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB tenant feature flags
Reads data from: MongoDB tenant feature flags
Permission: `tenant.settings.update`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Dashboard
Feature: Dashboard
Module: Settings
API names: dashboardOverview, superAdminOverview, platformStats
API type: Query
GraphQL field or endpoint: `dashboardOverview`, `superAdminOverview`, `platformStats`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/dashboard.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/dashboard.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct model aggregation / counts
DB model: `Tenant`, `Profile`, `Student`, `Application`, `Enquiry`
DB collection: Mongoose default collection, needs verification
Stores data in: Not stored, computed dashboard response only
Reads data from: Multiple MongoDB collections
Permission: Platform admin or tenant dashboard access; needs verification
Tenant required: Dashboard may be platform or tenant scoped
Audit log: Read only
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Audit Logs
Feature: Audit Logs
Module: Settings
API names: listAuditLogs, listPlatformAuditLogs, getPlatformAuditLog
API type: Query
GraphQL field or endpoint: `listAuditLogs`, `listPlatformAuditLogs`, `getPlatformAuditLog`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: [apps/settings-service/src/use-cases/audit-logs.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/use-cases/audit-logs.ts)
Helper file, if any: [apps/settings-service/src/settings-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/settings-utils.ts)
Repository method: direct audit-log model access
DB model: `AuditLog`, `PlatformAuditLog`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB audit logs
Reads data from: MongoDB audit logs
Permission: `admin.audit.read` / platform audit access; needs verification
Tenant required: listAuditLogs is tenant scoped; platform logs are platform scoped
Audit log: Read only
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Health
Feature: Health Check
Module: Settings
API names: health, GET:/api/health
API type: REST
GraphQL field or endpoint: `GET:/api/health`
Lambda/service: settings-service
Handler: [apps/settings-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/handler.ts)
Route file: [apps/settings-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/settings-service/src/routes.ts)
Use-case file: Needs verification
Helper file, if any: None
Repository method: None
DB model: None
DB collection: N/A
Stores data in: Not stored, health response only
Reads data from: Not stored
Permission: Public / needs verification
Tenant required: No
Audit log: No
External service: None
File storage: No
Frontend usage: Needs verification
Status: Needs verification
Notes: `health` is routed in settings-service but is not exposed in the GraphQL schema.

## Communication APIs

### Announcements
Feature: Announcements
Module: Communication
API names: listAnnouncements, getAnnouncement, createAnnouncement, updateAnnouncement, publishAnnouncement, archiveAnnouncement, deleteAnnouncement
API type: Query / Mutation
GraphQL field or endpoint: `listAnnouncements`, `getAnnouncement`, `createAnnouncement`, `updateAnnouncement`, `publishAnnouncement`, `archiveAnnouncement`, `deleteAnnouncement`
Lambda/service: comms-service
Handler: [apps/comms-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/handler.ts)
Route file: [apps/comms-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/routes.ts)
Use-case file: [apps/comms-service/src/use-cases/announcements.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/use-cases/announcements.ts)
Helper file, if any: [apps/comms-service/src/comms-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/comms-utils.ts)
Repository method: direct model access for `Announcement`
DB model: `Announcement`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB announcements
Reads data from: MongoDB announcements
Permission: `comms.announcements.read`, `comms.announcements.create`, `comms.announcements.update`, `comms.announcements.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Events
Feature: Events
Module: Communication
API names: listEvents, getEvent, createEvent, updateEvent, deleteEvent
API type: Query / Mutation
GraphQL field or endpoint: `listEvents`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`
Lambda/service: comms-service
Handler: [apps/comms-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/handler.ts)
Route file: [apps/comms-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/routes.ts)
Use-case file: [apps/comms-service/src/use-cases/events.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/use-cases/events.ts)
Helper file, if any: [apps/comms-service/src/comms-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/comms-utils.ts)
Repository method: direct model access for `CalendarEvent`
DB model: `CalendarEvent`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB events
Reads data from: MongoDB events
Permission: `comms.events.read`, `comms.events.create`, `comms.events.update`, `comms.events.delete`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Leave Requests
Feature: Leave Requests
Module: Communication
API names: listLeaveRequests, getLeaveRequest, createLeaveRequest, updateLeaveRequest, approveLeave, rejectLeave, cancelLeave, deleteLeaveRequest
API type: Query / Mutation
GraphQL field or endpoint: `listLeaveRequests`, `getLeaveRequest`, `createLeaveRequest`, `updateLeaveRequest`, `approveLeave`, `rejectLeave`, `cancelLeave`, `deleteLeaveRequest`
Lambda/service: comms-service
Handler: [apps/comms-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/handler.ts)
Route file: [apps/comms-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/routes.ts)
Use-case file: [apps/comms-service/src/use-cases/leave-requests.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/use-cases/leave-requests.ts)
Helper file, if any: [apps/comms-service/src/comms-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/comms-service/src/comms-utils.ts)
Repository method: direct model access for `LeaveRequest`
DB model: `LeaveRequest`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB leave requests
Reads data from: MongoDB leave requests
Permission: `comms.leave.read`, `comms.leave.approve`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

## Results APIs

### Result Batches
Feature: Result Batches
Module: Results
API names: listResultBatches, getResultBatch, createResultBatch, updateResultBatch, publishResultBatch, archiveResultBatch, deleteResultBatch
API type: Query / Mutation
GraphQL field or endpoint: `listResultBatches`, `getResultBatch`, `createResultBatch`, `updateResultBatch`, `publishResultBatch`, `archiveResultBatch`, `deleteResultBatch`
Lambda/service: results-service
Handler: [apps/results-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/handler.ts)
Route file: [apps/results-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/routes.ts)
Use-case file: [apps/results-service/src/use-cases/result-batches.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/use-cases/result-batches.ts), [apps/results-service/src/use-cases/result-publishing.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/use-cases/result-publishing.ts)
Helper file, if any: [apps/results-service/src/results-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/results-utils.ts)
Repository method: direct model access for `ResultBatch`
DB model: `ResultBatch`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB result batches
Reads data from: MongoDB result batches
Permission: `academics.results.read`, `academics.results.create`, `academics.results.update`, `academics.results.delete`, `academics.results.publish`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Public Results
Feature: Public Results
Module: Results
API names: getPublicResult, getResultPublicToken, GET:/api/public/results/:token
API type: Query / REST
GraphQL field or endpoint: `getPublicResult`, `getResultPublicToken`, `GET:/api/public/results/:token`
Lambda/service: results-service
Handler: [apps/results-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/handler.ts)
Route file: [apps/results-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/routes.ts)
Use-case file: [apps/results-service/src/use-cases/public-results.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/use-cases/public-results.ts)
Helper file, if any: [apps/results-service/src/results-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/results-service/src/results-utils.ts)
Repository method: direct model access for `PublishedResultBatch`
DB model: `PublishedResultBatch`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB published result batches
Reads data from: MongoDB published result batches
Permission: Public token lookup; no tenant auth required for token endpoint
Tenant required: No for public token access
Audit log: Read only
External service: None
File storage: Signed URL generated for result file
Frontend usage: Needs verification
Status: Active

## Storage APIs

### Upload URL
Feature: Upload URL
Module: Storage
API names: generateUploadUrl, POST:/api/storage/upload-url
API type: Mutation / REST
GraphQL field or endpoint: `generateUploadUrl`, `POST:/api/storage/upload-url`
Lambda/service: storage-service
Handler: [apps/storage-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/handler.ts)
Route file: [apps/storage-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/routes.ts)
Use-case file: [apps/storage-service/src/use-cases/uploads.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/use-cases/uploads.ts)
Helper file, if any: [apps/storage-service/src/storage-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/storage-utils.ts)
Repository method: None
DB model: None
DB collection: N/A
Stores data in: S3 signed upload URL only
Reads data from: None
Permission: Needs verification
Tenant required: Yes
Audit log: No
External service: S3
File storage: S3 signed upload URL
Frontend usage: Needs verification
Status: Active

### Download URL
Feature: Download URL
Module: Storage
API names: generateDownloadUrl, GET:/api/storage/download-url
API type: Query / REST
GraphQL field or endpoint: `generateDownloadUrl`, `GET:/api/storage/download-url`
Lambda/service: storage-service
Handler: [apps/storage-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/handler.ts)
Route file: [apps/storage-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/routes.ts)
Use-case file: [apps/storage-service/src/use-cases/downloads.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/use-cases/downloads.ts)
Helper file, if any: [apps/storage-service/src/storage-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/storage-service/src/storage-utils.ts)
Repository method: None
DB model: None
DB collection: N/A
Stores data in: S3 signed download URL only
Reads data from: None
Permission: Needs verification
Tenant required: Yes
Audit log: No
External service: S3
File storage: S3 signed download URL
Frontend usage: Needs verification
Status: Active

## Admin Cleanup APIs

### Duplicate Reports
Feature: Duplicate Reports
Module: Admin Cleanup
API names: getDuplicateReport, getDuplicateEnquiryReport, getDuplicateStudentReport
API type: Query
GraphQL field or endpoint: `getDuplicateReport`, `getDuplicateEnquiryReport`, `getDuplicateStudentReport`
Lambda/service: admin-cleanup-service
Handler: [apps/admin-cleanup-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/handler.ts)
Route file: [apps/admin-cleanup-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/routes.ts)
Use-case file: [apps/admin-cleanup-service/src/use-cases/duplicate-reports.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/use-cases/duplicate-reports.ts)
Helper file, if any: [apps/admin-cleanup-service/src/cleanup-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/cleanup-utils.ts)
Repository method: direct model aggregations on enquiries and students
DB model: `Enquiry`, `Student`
DB collection: Mongoose default collection, needs verification
Stores data in: Not stored, computed duplicate report only
Reads data from: MongoDB enquiries and students
Permission: `admin.cleanup.read`
Tenant required: Yes
Audit log: Read only
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Merge Records
Feature: Merge / Deduplication
Module: Admin Cleanup
API names: runDeduplication, mergeEnquiries, mergeStudents
API type: Mutation
GraphQL field or endpoint: `runDeduplication`, `mergeEnquiries`, `mergeStudents`
Lambda/service: admin-cleanup-service
Handler: [apps/admin-cleanup-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/handler.ts)
Route file: [apps/admin-cleanup-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/routes.ts)
Use-case file: [apps/admin-cleanup-service/src/use-cases/merge-records.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/use-cases/merge-records.ts)
Helper file, if any: [apps/admin-cleanup-service/src/cleanup-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/cleanup-utils.ts)
Repository method: `Enquiry.deleteMany`, `Application.updateMany`, `Student.updateMany`
DB model: `Enquiry`, `Application`, `Student`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB merge state and source record mutations
Reads data from: MongoDB enquiries, applications, students
Permission: `admin.cleanup.write`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

### Cleanup Records
Feature: Cleanup Records
Module: Admin Cleanup
API names: bulkDeleteInactiveEnquiries
API type: Mutation
GraphQL field or endpoint: `bulkDeleteInactiveEnquiries`
Lambda/service: admin-cleanup-service
Handler: [apps/admin-cleanup-service/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/handler.ts)
Route file: [apps/admin-cleanup-service/src/routes.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/routes.ts)
Use-case file: [apps/admin-cleanup-service/src/use-cases/cleanup-records.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/use-cases/cleanup-records.ts)
Helper file, if any: [apps/admin-cleanup-service/src/cleanup-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/admin-cleanup-service/src/cleanup-utils.ts)
Repository method: `Enquiry.deleteMany`
DB model: `Enquiry`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB cleanup mutations
Reads data from: MongoDB enquiries
Permission: `admin.cleanup.write`
Tenant required: Yes
Audit log: Writes should be audited
External service: None
File storage: No
Frontend usage: Needs verification
Status: Active

## Workers

### Cognito Sync Worker
Feature: Cognito-to-DB sync
Module: Workers
API names: PostConfirmation trigger
API type: Worker
GraphQL field or endpoint: N/A
Lambda/service: workers/cognito-sync
Handler: [apps/workers/cognito-sync/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/cognito-sync/src/handler.ts)
Route file: None
Use-case file: [apps/workers/cognito-sync/src/job.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/cognito-sync/src/job.ts)
Helper file, if any: [apps/workers/cognito-sync/src/worker-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/cognito-sync/src/worker-utils.ts)
Repository method: `IdentityRepo.upsertByCognitoSub`
DB model: `AuthUser`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB auth user sync records
Reads data from: Cognito user pool event and MongoDB auth users
Permission: N/A
Tenant required: No
Audit log: Worker log only
External service: Cognito
File storage: No
Frontend usage: N/A
Status: Active

### Email Worker
Feature: Email Delivery Worker
Module: Workers
API names: SQS email jobs
API type: Worker
GraphQL field or endpoint: N/A
Lambda/service: workers/email-worker
Handler: [apps/workers/email-worker/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/email-worker/src/handler.ts)
Route file: None
Use-case file: [apps/workers/email-worker/src/job.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/email-worker/src/job.ts)
Helper file, if any: [apps/workers/email-worker/src/worker-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/email-worker/src/worker-utils.ts)
Repository method: None
DB model: None
DB collection: N/A
Stores data in: Not stored; sends email via SES
Reads data from: SQS job payload
Permission: N/A
Tenant required: No
Audit log: Worker log only
External service: SES
File storage: No
Frontend usage: N/A
Status: Active

### Jobs Worker
Feature: Background Jobs Worker
Module: Workers
API names: SQS background jobs
API type: Worker
GraphQL field or endpoint: N/A
Lambda/service: workers/jobs-worker
Handler: [apps/workers/jobs-worker/src/handler.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/jobs-worker/src/handler.ts)
Route file: None
Use-case file: [apps/workers/jobs-worker/src/job.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/jobs-worker/src/job.ts)
Helper file, if any: [apps/workers/jobs-worker/src/worker-utils.ts](E:/APPLICATION/vebgenix-backend-main/apps/workers/jobs-worker/src/worker-utils.ts)
Repository method: `AcademicsRepo.updateStudent`
DB model: `Student`
DB collection: Mongoose default collection, needs verification
Stores data in: MongoDB student records
Reads data from: SQS job payload and student collection
Permission: N/A
Tenant required: Job payload contains tenant id
Audit log: Worker log only
External service: None
File storage: No
Frontend usage: N/A
Status: Active

## Deprecated / Removed APIs

- Installment Plan: old finance module, old service `finance-service`, status `Deprecated`, reason: removed from live code and schema exposure
- Manual Collection: old finance module, old service `finance-service`, status `Deprecated`, reason: removed from live code and schema exposure
- Fee Category API exposure: old finance module, old service `finance-service`, status `Deprecated`, reason: no runtime implementation and removed from live code

## Mismatches and verification notes

- Found in schema but not routed: `generateReceiptPdf`, `listRoles`, `finalizeTenant` should be verified against AppSync routing.
- Routed but missing from schema: `health`, `GET:/api/health` in settings-service.
- Unknown DB collection: most Mongoose models here do not declare an explicit collection; treat as `Mongoose default collection, needs verification` unless the model file specifies `collection`.
- Frontend usage: no frontend folder is present in this repository, so frontend usage is marked `Needs verification` unless found in another workspace.\n*** End Patch

