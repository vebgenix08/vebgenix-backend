// ── Connection ────────────────────────────────────────────────────────────────
export { connectDB, disconnectDB } from './connection';

// ── Lambda bootstrap helpers ──────────────────────────────────────────────────
export { bootstrapDB, ensureDB } from './lambda';

// ── Tenant scope helper ───────────────────────────────────────────────────────
export { withTenant } from './withTenant';
export type { TenantScope } from './withTenant';

// ── Tenant ID generator ───────────────────────────────────────────────────────
export { generateTenantId, isValidTenantId } from './generateTenantId';

// ── Models: Auth ──────────────────────────────────────────────────────────────
export { AuthUser } from './models/auth/AuthUser.model';
export type { IAuthUser } from './models/auth/AuthUser.model';
export { Profile } from './models/auth/Profile.model';
export type { IProfile, IRoleAssignment, ICampusAccess, PersonaRole } from './models/auth/Profile.model';

// ── Models: Settings ──────────────────────────────────────────────────────────
export { Tenant } from './models/settings/Tenant.model';
export type { ITenant } from './models/settings/Tenant.model';
export { Campus } from './models/settings/Campus.model';
export type { ICampus, CampusType } from './models/settings/Campus.model';
export { AcademicYear } from './models/settings/AcademicYear.model';
export type { IAcademicYear } from './models/settings/AcademicYear.model';
export { Program } from './models/settings/Program.model';
export type { IProgram, ProgramType } from './models/settings/Program.model';
export { Template } from './models/settings/Template.model';
export type { ITemplate, TemplateType, TemplateStatus } from './models/settings/Template.model';
export { TenantFeature } from './models/settings/TenantFeature.model';
export type { ITenantFeature, ITenantFeatureFlags } from './models/settings/TenantFeature.model';

// ── Models: Admissions ────────────────────────────────────────────────────────
export { Enquiry } from './models/admissions/Enquiry.model';
export type { IEnquiry, EnquiryStatus } from './models/admissions/Enquiry.model';
export { Application } from './models/admissions/Application.model';
export type { IApplication, ApplicationStatus } from './models/admissions/Application.model';

// ── Models: Academics ─────────────────────────────────────────────────────────
export { Class } from './models/academics/Class.model';
export type { IClass } from './models/academics/Class.model';
export { Section } from './models/academics/Section.model';
export type { ISection } from './models/academics/Section.model';
export { Subject } from './models/academics/Subject.model';
export type { ISubject, SubjectType } from './models/academics/Subject.model';
export { SubjectAllocation } from './models/academics/SubjectAllocation.model';
export type { ISubjectAllocation } from './models/academics/SubjectAllocation.model';
export { Student } from './models/academics/Student.model';
export type { IStudent, StudentStatus, AdmissionStatus } from './models/academics/Student.model';
export { AcademicSequence } from './models/academics/AcademicSequence.model';
export type { IAcademicSequence } from './models/academics/AcademicSequence.model';
export { StudentAcademicEnrollment } from './models/academics/StudentAcademicEnrollment.model';
export type { IStudentAcademicEnrollment, EnrollmentStatus, NumberingStatus, JoiningType, PromotionEligibility } from './models/academics/StudentAcademicEnrollment.model';
export { AcademicRegistrationBatch } from './models/academics/AcademicRegistrationBatch.model';
export type { IAcademicRegistrationBatch, BatchStatus } from './models/academics/AcademicRegistrationBatch.model';
export { AcademicRollNoBatch } from './models/academics/AcademicRollNoBatch.model';
export type { IAcademicRollNoBatch, RollNoBatchStatus, RollNoGenerationMode } from './models/academics/AcademicRollNoBatch.model';
export { StudentPromotionBatch } from './models/academics/StudentPromotionBatch.model';
export type { IStudentPromotionBatch, PromotionBatchStatus, SectionStrategy, FeeAction } from './models/academics/StudentPromotionBatch.model';
export { StudentPromotionBatchItem } from './models/academics/StudentPromotionBatchItem.model';
export type { IStudentPromotionBatchItem, PromotionItemAction, FeeAssignmentStatus as PromotionFeeAssignmentStatus } from './models/academics/StudentPromotionBatchItem.model';
export { Employee } from './models/academics/Employee.model';
export type { IEmployee, StaffType, EmploymentType, StaffCategory } from './models/academics/Employee.model';
export { Attendance } from './models/academics/Attendance.model';
export type { IAttendance, AttendanceStatus } from './models/academics/Attendance.model';
export { Exam } from './models/academics/Exam.model';
export type { IExam, ExamStatus } from './models/academics/Exam.model';
export { Timetable } from './models/academics/Timetable.model';
export type { ITimetable, ITimetableSlot, DayOfWeek } from './models/academics/Timetable.model';
export { Certificate } from './models/academics/Certificate.model';
export type { ICertificate, CertificateType, CertificateStatus } from './models/academics/Certificate.model';
export { PublishedResultBatch } from './models/academics/PublishedResultBatch.model';
export type { IPublishedResultBatch, ResultBatchStatus } from './models/academics/PublishedResultBatch.model';

// ── Models: Finance ───────────────────────────────────────────────────────────
export { FeeHead } from './models/finance/FeeHead.model';
export type { IFeeHead, FeeHeadType } from './models/finance/FeeHead.model';
export { FeeStructure } from './models/finance/FeeStructure.model';
export type { IFeeStructure, IFeeComponent } from './models/finance/FeeStructure.model';
export { FeeStructureClassMapping } from './models/finance/FeeStructureClassMapping.model';
export type { IFeeStructureClassMapping, FeeStructureClassMappingStatus } from './models/finance/FeeStructureClassMapping.model';
export { FeeAssignment } from './models/finance/FeeAssignment.model';
export type { IFeeAssignment, FeeAssignmentStatus } from './models/finance/FeeAssignment.model';
export { FeeSchedule } from './models/finance/FeeSchedule.model';
export type { IFeeSchedule, IFeeScheduleSlot } from './models/finance/FeeSchedule.model';
export { InstallmentPlan } from './models/finance/InstallmentPlan.model';
export type { IInstallmentPlan } from './models/finance/InstallmentPlan.model';
export { FeeRevision } from './models/finance/FeeRevision.model';
export type { IFeeRevision } from './models/finance/FeeRevision.model';
export { Invoice } from './models/finance/Invoice.model';
export type { IInvoice, IInvoiceItem, InvoiceStatus, CollectionType } from './models/finance/Invoice.model';
export { Payment } from './models/finance/Payment.model';
export type { IPayment, PaymentMethod, PaymentStatus } from './models/finance/Payment.model';
export { FinanceSequence } from './models/finance/FinanceSequence.model';
export type { IFinanceSequence } from './models/finance/FinanceSequence.model';
export { PaymentAllocation } from './models/finance/PaymentAllocation.model';
export type { IPaymentAllocation } from './models/finance/PaymentAllocation.model';
export { StudentTransaction } from './models/finance/StudentTransaction.model';
export type { IStudentTransaction, StudentTransactionType, StudentTransactionStatus } from './models/finance/StudentTransaction.model';
export { default as StudentFeeOrder } from './models/finance/StudentFeeOrders.model';
export { ManualStudentFeeAccount } from './models/finance/ManualStudentFeeAccount.model';
export type { IManualStudentFeeAccount, ManualFeeAccountStatus } from './models/finance/ManualStudentFeeAccount.model';
export { ManualFeeCollection } from './models/finance/ManualFeeCollection.model';
export type { IManualFeeCollection, ManualReceiptStatus, ManualPaymentMode } from './models/finance/ManualFeeCollection.model';
export { ManualFeeCollectionParticular } from './models/finance/ManualFeeCollectionParticular.model';
export type { IManualFeeCollectionParticular } from './models/finance/ManualFeeCollectionParticular.model';

// ── Models: Comms ─────────────────────────────────────────────────────────────
export { Announcement } from './models/comms/Announcement.model';
export type { IAnnouncement, AnnouncementStatus, AnnouncementTargetGroup } from './models/comms/Announcement.model';
export { Event } from './models/comms/Event.model';
export type { IEvent } from './models/comms/Event.model';
export { LeaveRequest } from './models/comms/LeaveRequest.model';
export type { ILeaveRequest, LeaveType, LeaveStatus } from './models/comms/LeaveRequest.model';

// ── Models: Audit ─────────────────────────────────────────────────────────────
export { AuditLog } from './models/audit/AuditLog.model';
export type { IAuditLog } from './models/audit/AuditLog.model';
export { PlatformAuditLog } from './models/audit/PlatformAuditLog.model';
export type { IPlatformAuditLog } from './models/audit/PlatformAuditLog.model';

// ── Repositories ──────────────────────────────────────────────────────────────
export { IdentityRepo } from './repositories/identity.repo';
export { AdmissionsRepo } from './repositories/admissions.repo';
export { FinanceRepo } from './repositories/finance.repo';
export { AcademicsRepo } from './repositories/academics.repo';
