import { AdmissionsRepo, Application, Student } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { exactNameRegex, normalizeDateOnly, studentNameConditions, toGql } from '../admissions-utils';
import { generateApplicationNo } from '../admissions-numbering';

async function createApplication(ctx: AuthContext, input: {
  campusId: string;
  academicYearId: string;
  enquiryId?: string;
  programId?: string;
  studentName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianRelation?: string;
  customFields?: Record<string, unknown>;
}) {
  authorize(ctx, 'admissions.application.create');
  const tenantId = getTenantId(ctx);

  let resolvedName  = input.studentName ?? '';
  let resolvedPhone = input.phone       ?? '';
  let resolvedEmail = input.email;

  if (input.enquiryId) {
    const enquiry = await AdmissionsRepo.findEnquiryById(tenantId, input.enquiryId);
    if (enquiry) {
      const eq = enquiry as unknown as Record<string, unknown>;
      resolvedName  = resolvedName  || (eq.studentName as string) || '';
      resolvedPhone = resolvedPhone || (eq.phone       as string) || '';
      resolvedEmail = resolvedEmail ?? (eq.email       as string | undefined);
    }
  }

  if (!resolvedName)  throw new AppError('BAD_REQUEST', 'studentName is required');
  if (!resolvedPhone) throw new AppError('BAD_REQUEST', 'phone is required');

  const exactDob = normalizeDateOnly(input.dateOfBirth);
  if (resolvedName && resolvedPhone && exactDob) {
    const existingApplication = await Application.findOne({
      tenantId,
      studentName: exactNameRegex(resolvedName),
      phone: resolvedPhone,
      dateOfBirth: exactDob,
      status: { $nin: ['REJECTED', 'WITHDRAWN'] },
    }).lean();
    if (existingApplication) {
      throw new AppError(
        'CONFLICT',
        `A matching application already exists for ${resolvedName}. Application #: ${existingApplication.applicationNumber}`,
      );
    }

    const existingStudent = await Student.findOne({
      tenantId,
      $or: studentNameConditions(resolvedName),
      phone: resolvedPhone,
      dateOfBirth: exactDob,
      status: { $ne: 'INACTIVE' },
    }).lean();
    if (existingStudent) {
      throw new AppError(
        'CONFLICT',
        `A matching student record already exists for ${resolvedName}. Registration #: ${existingStudent.registrationNumber}`,
      );
    }
  }

  const applicationNumber = await generateApplicationNo(tenantId, input.academicYearId);

  const application = await AdmissionsRepo.createApplication(tenantId, {
    campusId:          new Types.ObjectId(input.campusId),
    academicYearId:    new Types.ObjectId(input.academicYearId),
    enquiryId:         input.enquiryId ? new Types.ObjectId(input.enquiryId) : undefined,
    programId:         input.programId ? new Types.ObjectId(input.programId) : undefined,
    applicationNumber,
    status:            'DRAFT',
    studentName:       resolvedName,
    phone:             resolvedPhone,
    email:             resolvedEmail,
    dateOfBirth:       input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
    gender:            input.gender,
    address:           input.address,
    guardianName:      input.guardianName,
    guardianPhone:     input.guardianPhone,
    guardianRelation:  input.guardianRelation,
    customFields:      input.customFields,
    documents:         [],
    reviews:           [],
    stageHistory:      [{ stage: 'DRAFT', at: new Date() }],
    createdBy:         new Types.ObjectId(ctx.membership!.profileId),
  });

  await AuditLogger.logTenantAction({
    ctx, action: 'APPLICATION_CREATED',
    entityType: 'Application', entityId: application._id.toString(), entityName: resolvedName,
  });

  return application;
}

export async function handleApplications(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listApplications':
    case 'GET:/api/admissions/applications': {
      authorize(ctx, 'admissions.application.read');
      const filter: Record<string, unknown> = {};
      if (args.status)   filter.status   = args.status;
      if (args.campusId) filter.campusId = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      const appList = await AdmissionsRepo.listApplications(tenantId, filter);
      return (appList as unknown[]).map(d => toGql(d));
    }
    case 'getApplication':
    case 'GET:/api/admissions/applications/:id':
      authorize(ctx, 'admissions.application.read');
      return toGql(await AdmissionsRepo.findApplicationById(tenantId, args.id as string));
    case 'createApplication':
    case 'POST:/api/admissions/applications':
      return toGql(await createApplication(ctx, ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof createApplication>[1]));
    case 'updateApplication':
    case 'PATCH:/api/admissions/applications/:id': {
      authorize(ctx, 'admissions.application.update');
      const input = ((args.input as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const updated = await AdmissionsRepo.updateApplication(tenantId, args.id as string, {
        ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
        ...(input.programId ? { programId: input.programId } : {}),
        ...(input.studentName ? { studentName: input.studentName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.guardianName !== undefined ? { guardianName: input.guardianName } : {}),
        ...(input.guardianPhone !== undefined ? { guardianPhone: input.guardianPhone } : {}),
        ...(input.guardianRelation !== undefined ? { guardianRelation: input.guardianRelation } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.documents ? { documents: input.documents } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
        ...(input.photoKey !== undefined ? { photoKey: input.photoKey } : {}),
      } as never);
      if (!updated) {
        throw new AppError('NOT_FOUND', 'Application not found');
      }
      return toGql(updated);
    }
    case 'submitApplication':
    case 'POST:/api/admissions/applications/:id/submit': {
      authorize(ctx, 'admissions.application.update');
      const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string);
      if (!app) throw new AppError('NOT_FOUND', 'Application not found');
      if (app.status !== 'DRAFT') throw new AppError('BAD_REQUEST', `Cannot submit — status is ${app.status}`);
      return toGql(await AdmissionsRepo.updateApplication(tenantId, args.id as string, {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      }));
    }
    case 'withdrawApplication':
    case 'POST:/api/admissions/applications/:id/withdraw': {
      authorize(ctx, 'admissions.application.update');
      const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string);
      if (!app) throw new AppError('NOT_FOUND', 'Application not found');
      if (['ENROLLED', 'WITHDRAWN'].includes(app.status)) {
        throw new AppError('BAD_REQUEST', `Cannot withdraw — status is ${app.status}`);
      }
      return toGql(await AdmissionsRepo.updateApplication(tenantId, args.id as string, { status: 'WITHDRAWN' }));
    }
    default:
      return undefined;
  }
}
