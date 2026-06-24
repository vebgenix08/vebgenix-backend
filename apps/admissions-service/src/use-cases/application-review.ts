import { AcademicSequence, AcademicYear, AcademicsRepo, AdmissionsRepo, Class, FinanceRepo, Student, type IStudentAcademicEnrollment } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import { getTenantId } from '@vebgenix/tenant';
import { toGql } from '../admissions-utils';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveClassForApplication(tenantId: string, application: Record<string, unknown>) {
  const programId = String(application.programId ?? '').trim();
  const programName = String(application.programName ?? '').trim();

  if (programId) {
    const byId = await Class.findOne({ tenantId, _id: programId }).lean();
    if (byId) return byId;
    const byProgram = await Class.findOne({ tenantId, programId }).lean();
    if (byProgram) return byProgram;
  }

  if (programName) {
    return Class.findOne({
      tenantId,
      $or: [
        { name: new RegExp(`^${escapeRegex(programName)}$`, 'i') },
        { code: new RegExp(`^${escapeRegex(programName)}$`, 'i') },
      ],
    }).lean();
  }

  return null;
}

async function resolveAcademicYearCode(tenantId: string, academicYearId: string): Promise<string> {
  const academicYear = await AcademicYear.findOne({ tenantId, _id: new Types.ObjectId(academicYearId) }).lean();
  if (academicYear?.startDate && academicYear?.endDate) {
    const start = academicYear.startDate.getFullYear() % 100;
    const end = academicYear.endDate.getFullYear() % 100;
    return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
  }
  if (academicYear?.name) {
    const match = academicYear.name.match(/(\d{2,4})\D+(\d{2,4})/);
    if (match) {
      const start = Number(match[1]) % 100;
      const end = Number(match[2]) % 100;
      return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
    }
    if (/^\d{2}-\d{2}$/.test(academicYear.name)) return academicYear.name;
  }
  const y = new Date().getFullYear() % 100;
  return `${y.toString().padStart(2, '0')}-${((y + 1) % 100).toString().padStart(2, '0')}`;
}

async function generateAdmissionNo(tenantId: string, academicYearId: string): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const doc = await AcademicSequence.findOneAndUpdate(
    { tenantId, scope: 'ADMISSION', key: yearCode },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'ADMISSION', key: yearCode } },
    { upsert: true, new: true },
  );
  return `ADM/${yearCode}/${doc.value.toString().padStart(4, '0')}`;
}

function formatNumberPadded(n: number, width = 3): string {
  return n.toString().padStart(width, '0');
}

async function admitApprovedApplication(ctx: AuthContext, tenantId: string, applicationId: string) {
  const application = await AdmissionsRepo.findApplicationById(tenantId, applicationId);
  if (!application) throw new AppError('NOT_FOUND', 'Application not found');
  const app = application as unknown as Record<string, unknown>;

  if (String(app.status ?? '') !== 'APPROVED') {
    throw new AppError('CONFLICT', 'Application must be APPROVED before enrollment');
  }

  const existingStudent = await Student.findOne({ tenantId, applicationId: new Types.ObjectId(applicationId) }).lean();
  if (existingStudent) return existingStudent;

  const classDoc = await resolveClassForApplication(tenantId, app);
  const firstName = String(app.studentName ?? '').trim().split(/\s+/)[0] || String(app.studentName ?? '').trim();
  const lastName = String(app.studentName ?? '').trim().split(/\s+/).slice(1).join(' ') || undefined;
  const fullName = String(app.studentName ?? '').trim();
  const academicYearId = String(app.academicYearId ?? '').trim();
  const campusId = String(app.campusId ?? '').trim();
  const admissionNo = await generateAdmissionNo(tenantId, academicYearId);

  const student = await AcademicsRepo.createStudent(tenantId, {
    campusId: new Types.ObjectId(campusId),
    academicYearId: new Types.ObjectId(academicYearId),
    applicationId: new Types.ObjectId(applicationId),
    programId: classDoc?.programId ? new Types.ObjectId(String(classDoc.programId)) : undefined,
    classId: classDoc?._id ? new Types.ObjectId(String(classDoc._id)) : undefined,
    registrationNumber: admissionNo,
    admissionNo,
    applicationNo: String(app.applicationNumber ?? ''),
    admissionStatus: 'ENROLLED',
    admissionConfirmedAt: new Date(),
    admissionConfirmedBy: new Types.ObjectId(ctx.membership!.profileId),
    firstName,
    lastName,
    fullName,
    phone: String(app.phone ?? ''),
    email: app.email ? String(app.email) : undefined,
    dateOfBirth: app.dateOfBirth ? new Date(String(app.dateOfBirth)) : undefined,
    gender: app.gender ? String(app.gender) : undefined,
    address: app.address ? String(app.address) : undefined,
    status: 'ACTIVE',
    guardians: app.guardianName && app.guardianPhone ? [{
      name: String(app.guardianName),
      relation: String(app.guardianRelation ?? 'Guardian'),
      phone: String(app.guardianPhone),
    }] : [],
  });

  if (classDoc?._id) {
    const rollNoBatch = app.sectionId
      ? await AcademicsRepo.findOrCreateRollNoBatch(
          tenantId, academicYearId, campusId, String(classDoc._id), String(app.sectionId),
        )
      : null;

    let rollNo: string | undefined;
    let rollNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';
    if (rollNoBatch && (rollNoBatch.status === 'FROZEN' || rollNoBatch.status === 'GENERATED')) {
      const nextRollNo = rollNoBatch.lastRollNo + 1;
      rollNo = formatNumberPadded(nextRollNo, 3);
      rollNoStatus = 'ASSIGNED';
      await AcademicsRepo.updateRollNoBatch(tenantId, rollNoBatch._id.toString(), { lastRollNo: nextRollNo });
    }

    const regBatch = await AcademicsRepo.findOrCreateRegistrationBatch(tenantId, academicYearId, campusId, String(classDoc._id));
    let registrationNo: string | undefined;
    let registrationNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';
    if (regBatch.status === 'FROZEN') {
      const nextRegNo = regBatch.lastRegistrationNo + 1;
      registrationNo = formatNumberPadded(nextRegNo, 3);
      registrationNoStatus = 'ASSIGNED';
      await AcademicsRepo.updateRegistrationBatch(tenantId, regBatch._id.toString(), { lastRegistrationNo: nextRegNo });
    }

    await AcademicsRepo.createEnrollment(tenantId, {
      studentId: new Types.ObjectId(student._id.toString()),
      academicYearId: new Types.ObjectId(academicYearId),
      campusId: new Types.ObjectId(campusId),
      gradeId: new Types.ObjectId(String(classDoc._id)),
      sectionId: app.sectionId ? new Types.ObjectId(String(app.sectionId)) : undefined,
      programId: classDoc.programId ? new Types.ObjectId(String(classDoc.programId)) : undefined,
      joiningDate: new Date(),
      joiningType: 'FRESH',
      registrationNo,
      registrationNoStatus,
      rollNo,
      rollNoStatus,
      status: 'ACTIVE',
      createdBy: new Types.ObjectId(ctx.membership!.profileId),
    } as Partial<IStudentAcademicEnrollment>);

    try {
      await FinanceRepo.autoGenerateFeeOrdersForStudent({
        tenantId,
        studentId: student._id.toString(),
        classId: String(classDoc._id),
        sectionId: app.sectionId ? String(app.sectionId) : undefined,
        academicYearId,
        campusId,
      });
    } catch (err) {
      console.warn('[approveApplication] Auto fee order generation failed (non-fatal):', err);
    }
  }

  await AdmissionsRepo.updateApplication(tenantId, applicationId, { status: 'ENROLLED' });
  try {
    const enquiryId = app.enquiryId;
    if (enquiryId) {
      await AdmissionsRepo.updateEnquiry(tenantId, String(enquiryId), { status: 'CONVERTED' });
    }
  } catch {
    console.warn('[approveApplication] Could not mark enquiry as CONVERTED — non-fatal');
  }

  return student;
}

async function reviewApplication(ctx: AuthContext, input: {
  applicationId: string;
  decision: 'APPROVED' | 'REJECTED';
  remarks?: string;
}) {
  authorize(ctx, 'admissions.application.review');
  const tenantId = getTenantId(ctx);

  const application = await AdmissionsRepo.findApplicationById(tenantId, input.applicationId);
  if (!application) throw new AppError('NOT_FOUND', 'Application not found');
  if (application.status !== 'SUBMITTED' && application.status !== 'UNDER_REVIEW') {
    throw new AppError('CONFLICT', 'Application is not in a reviewable state');
  }

  const newStatus = input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  const updated = await AdmissionsRepo.updateApplication(tenantId, input.applicationId, { status: newStatus });
  await AdmissionsRepo.addReview(tenantId, input.applicationId, {
    reviewedBy: new Types.ObjectId(ctx.membership!.profileId),
    reviewedAt: new Date(),
    decision:   input.decision,
    remarks:    input.remarks,
  });

  await AuditLogger.logTenantAction({
    ctx, action: `APPLICATION_${input.decision}`,
    entityType: 'Application', entityId: input.applicationId, entityName: application.studentName,
    before: { status: application.status },
    after:  { status: newStatus, remarks: input.remarks },
  });

  return updated;
}

export async function handleApplicationReview(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'getApprovalQueue':
    case 'GET:/api/admissions/applications/approval-queue': {
      authorize(ctx, 'admissions.application.review');
      const queueList = await AdmissionsRepo.listApplications(tenantId, {
        ...(args.campusId ? { campusId: args.campusId } : {}),
        ...(args.academicYearId ? { academicYearId: args.academicYearId } : {}),
        status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
      });
      return (queueList as unknown[]).map(d => toGql(d));
    }
    case 'getApplicationReviews':
    case 'GET:/api/admissions/applications/:id/reviews': {
      authorize(ctx, 'admissions.application.read');
      const appId = (args.applicationId ?? args.id) as string;
      const app = await AdmissionsRepo.findApplicationById(tenantId, appId);
      if (!app) throw new AppError('NOT_FOUND', 'Application not found');
      return app.reviews ?? [];
    }
    case 'reviewApplication':
    case 'POST:/api/admissions/applications/:id/review':
      return toGql(await reviewApplication(ctx, {
        applicationId: args.id as string,
        ...((args.input as object) ?? args),
      } as Parameters<typeof reviewApplication>[1]));
    case 'approveApplication':
    case 'POST:/api/admissions/applications/:id/approve': {
      authorize(ctx, 'admissions.application.approve');
      const updated = await AdmissionsRepo.updateApplication(tenantId, args.id as string, {
        status:     'APPROVED',
        approvedAt: new Date(),
        approvedBy: new Types.ObjectId(ctx.membership!.profileId),
      });
      await admitApprovedApplication(ctx, tenantId, args.id as string);
      return toGql(updated);
    }
    case 'rejectApplication':
    case 'POST:/api/admissions/applications/:id/reject': {
      authorize(ctx, 'admissions.application.approve');
      return toGql(await AdmissionsRepo.updateApplication(tenantId, args.id as string, {
        status:          'REJECTED',
        rejectedAt:      new Date(),
        rejectedBy:      new Types.ObjectId(ctx.membership!.profileId),
        rejectionReason: args.reason as string | undefined,
      }));
    }
    default:
      return undefined;
  }
}
