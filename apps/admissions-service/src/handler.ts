/**
 * Admissions Service Lambda
 *
 * Handles: enquiries, applications, duplicate detection, document workflow,
 *          public enquiry form (no auth), approval queue.
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer) — event.identity.claims pre-verified
 *   - API Gateway REST — Authorization: Bearer <Cognito Access Token>
 *   - API Gateway REST (public route) — no auth for public enquiry submission
 */
import { bootstrapDB, ensureDB, AdmissionsRepo, AcademicYear, AcademicSequence, Application } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method  = event.httpMethod as string;
  const path    = event.path as string;
  const body    = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params  = (event.pathParameters ?? {}) as Record<string, string>;
  const qs      = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

// ── Inlined: academicNumbering ────────────────────────────────────────────────
async function resolveAcademicYearCode(tenantId: string, academicYearId: string | Types.ObjectId): Promise<string> {
  const id = typeof academicYearId === 'string' ? new Types.ObjectId(academicYearId) : academicYearId;
  const academicYear = await AcademicYear.findOne({ tenantId, _id: id }).lean();

  if (academicYear?.startDate && academicYear?.endDate) {
    const start = academicYear.startDate.getFullYear() % 100;
    const end   = academicYear.endDate.getFullYear()   % 100;
    return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
  }
  if (academicYear?.name) {
    const match = academicYear.name.match(/(\d{2,4})\D+(\d{2,4})/);
    if (match) {
      const start = Number(match[1]) % 100;
      const end   = Number(match[2]) % 100;
      return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
    }
    if (/^\d{2}-\d{2}$/.test(academicYear.name)) return academicYear.name;
  }
  const y = new Date().getFullYear() % 100;
  return `${y.toString().padStart(2, '0')}-${((y + 1) % 100).toString().padStart(2, '0')}`;
}

async function generateApplicationNo(tenantId: string, academicYearId: string | Types.ObjectId): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const doc = await AcademicSequence.findOneAndUpdate(
    { tenantId, scope: 'APPLICATION', key: yearCode },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'APPLICATION', key: yearCode } },
    { upsert: true, new: true },
  );
  return `APP/${yearCode}/${doc.value.toString().padStart(4, '0')}`;
}

// ── Inlined use-case: createEnquiry ──────────────────────────────────────────
async function createEnquiry(ctx: AuthContext, input: {
  campusId: string;
  academicYearId?: string;
  studentName: string;
  phone: string;
  email?: string;
  programId?: string;
  programName?: string;
  source?: string;
  notes?: string;
}) {
  authorize(ctx, 'admissions.enquiry.create');
  const tenantId = getTenantId(ctx);

  const dup = await AdmissionsRepo.findDuplicateEnquiry(tenantId, input.phone, input.email);
  if (dup) {
    const dup2 = dup as unknown as Record<string, unknown>;
    throw new AppError('CONFLICT', `An enquiry already exists for this contact (phone: ${input.phone}). Existing ID: ${String(dup2._id ?? dup2.id)}`);
  }

  const enquiry = await AdmissionsRepo.createEnquiry(tenantId, {
    campusId:       new Types.ObjectId(input.campusId),
    academicYearId: input.academicYearId ? new Types.ObjectId(input.academicYearId) : undefined,
    studentName:    input.studentName,
    phone:          input.phone,
    email:          input.email,
    programId:      input.programId ? new Types.ObjectId(input.programId) : undefined,
    programName:    input.programName,
    source:         input.source,
    notes:          input.notes,
    status:         'NEW',
    createdBy:      new Types.ObjectId(ctx.membership!.profileId),
  });

  await AuditLogger.logTenantAction({
    ctx, action: 'ENQUIRY_CREATED',
    entityType: 'Enquiry', entityId: enquiry._id.toString(), entityName: input.studentName,
    after: input as unknown as Record<string, unknown>,
  });

  return enquiry;
}

// ── Inlined use-case: createApplication ──────────────────────────────────────
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

  const dupApp = await (Application as unknown as { findOne: (q: Record<string, unknown>) => Promise<unknown> }).findOne({
    tenantId,
    academicYearId: new Types.ObjectId(input.academicYearId),
    phone: resolvedPhone,
    status: { $nin: ['REJECTED', 'WITHDRAWN'] },
  });
  if (dupApp) {
    const d = dupApp as unknown as Record<string, unknown>;
    throw new AppError('CONFLICT', `An application already exists for this phone number (status: ${d.status}). Application #: ${d.applicationNumber}`);
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

// ── Inlined use-case: reviewApplication ──────────────────────────────────────
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

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();

    const { operation, args } = parseEvent(event);

    // ── Public enquiry — no auth ─────────────────────────────────────────────
    if (operation === 'POST:/api/public/admissions/enquiries' || operation === 'createPublicEnquiry') {
      if (!args.tenantId) throw new AppError('BAD_REQUEST', 'tenantId is required for public enquiry');
      const tenantId = args.tenantId as string;
      const enquiry  = await AdmissionsRepo.createEnquiry(tenantId, {
        campusId:    new Types.ObjectId(args.campusId as string),
        studentName: args.studentName as string,
        email:       args.email       as string | undefined,
        phone:       args.phone       as string,
        programId:   args.programId   ? new Types.ObjectId(args.programId as string) : undefined,
        notes:       args.notes       as string | undefined,
        source:      'PUBLIC_FORM',
        status:      'NEW',
      });
      return { success: true, id: enquiry._id };
    }

    // ── All other routes require auth ────────────────────────────────────────
    const ctx = await resolveContext(event);
    const tenantId = getTenantId(ctx);

    switch (operation) {

      // ── Enquiries ────────────────────────────────────────────────────────────
      case 'listEnquiries':
      case 'GET:/api/admissions/enquiries': {
        authorize(ctx, 'admissions.enquiry.read');
        const inputFilter = (args.filter as Record<string, unknown> | undefined) ?? {};
        const filter: Record<string, unknown> = {};
        const status = inputFilter.status ?? args.status;
        const campusId = inputFilter.campusId ?? args.campusId;
        const academicYearId = inputFilter.academicYearId ?? args.academicYearId;
        const programId = inputFilter.programId ?? args.programId;
        const source = inputFilter.source ?? args.source;
        const search = String(inputFilter.search ?? args.search ?? '').trim();
        if (status) filter.status = status;
        if (campusId) filter.campusId = campusId;
        if (academicYearId) filter.academicYearId = academicYearId;
        if (programId) filter.programId = programId;
        if (source) filter.source = source;
        if (search) {
          filter.$or = [
            { studentName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ];
        }
        const enquiryList = await AdmissionsRepo.listEnquiries(tenantId, filter);
        return (enquiryList as unknown[]).map(d => toGql(d));
      }

      case 'getEnquiry':
      case 'GET:/api/admissions/enquiries/:id':
        authorize(ctx, 'admissions.enquiry.read');
        return toGql(await AdmissionsRepo.findEnquiryById(tenantId, args.id as string));

      case 'createEnquiry':
      case 'POST:/api/admissions/enquiries':
        return toGql(await createEnquiry(ctx, ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof createEnquiry>[1]));

      case 'updateEnquiry':
      case 'PATCH:/api/admissions/enquiries/:id': {
        authorize(ctx, 'admissions.enquiry.update');
        const { id, input: enquiryInput, ...restArgs } = args as Record<string, unknown>;
        const update = (enquiryInput as Record<string, unknown>) ?? restArgs;
        return toGql(await AdmissionsRepo.updateEnquiry(tenantId, id as string, update));
      }

      case 'deleteEnquiry':
      case 'DELETE:/api/admissions/enquiries/:id':
        authorize(ctx, 'admissions.enquiry.delete');
        await AdmissionsRepo.deleteEnquiry(tenantId, args.id as string);
        return true;

      case 'checkDuplicate':
      case 'POST:/api/admissions/duplicate-check': {
        authorize(ctx, 'admissions.enquiry.read');
        const dupInput = (args.input ?? args) as Record<string, unknown>;
        return toGql(await AdmissionsRepo.findDuplicateEnquiry(tenantId, dupInput.phone as string, dupInput.email as string | undefined));
      }

      // ── Applications ─────────────────────────────────────────────────────────
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
        return toGql(await AdmissionsRepo.updateApplication(tenantId, args.id as string, {
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
        } as never));
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

      case 'reviewApplication':
      case 'POST:/api/admissions/applications/:id/review':
        return toGql(await reviewApplication(ctx, {
          applicationId: args.id as string,
          ...((args.input as object) ?? args),
        } as Parameters<typeof reviewApplication>[1]));

      case 'getApplicationReviews':
      case 'GET:/api/admissions/applications/:id/reviews': {
        authorize(ctx, 'admissions.application.read');
        const appId = (args.applicationId ?? args.id) as string;
        const app = await AdmissionsRepo.findApplicationById(tenantId, appId);
        if (!app) throw new AppError('NOT_FOUND', 'Application not found');
        return app.reviews ?? [];
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

      case 'updateApplicationStatus':
      case 'PATCH:/api/admissions/applications/:id/status': {
        authorize(ctx, 'admissions.application.update');
        return toGql(await AdmissionsRepo.updateApplication(tenantId, args.id as string, { status: args.status as never }));
      }

      case 'approveApplication':
      case 'POST:/api/admissions/applications/:id/approve': {
        authorize(ctx, 'admissions.application.approve');
        return toGql(await AdmissionsRepo.updateApplication(tenantId, args.id as string, {
          status:     'APPROVED',
          approvedAt: new Date(),
          approvedBy: new Types.ObjectId(ctx.membership!.profileId),
        }));
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

      // ── Document workflow ────────────────────────────────────────────────────
      case 'verifyDocument':
      case 'POST:/api/admissions/applications/:id/documents/:docKey/verify': {
        authorize(ctx, 'admissions.application.review');
        const appId  = (args.applicationId ?? args.id) as string;
        const docKey = (args.documentId ?? args.docKey ?? args.docType) as string;
        const app = await AdmissionsRepo.findApplicationById(tenantId, appId);
        if (!app) throw new AppError('NOT_FOUND', 'Application not found');
        const docs     = (app.documents ?? []) as unknown as Array<Record<string, unknown>>;
        const docIndex = docs.findIndex((d) => d.id?.toString() === docKey || d.key === docKey || d.type === docKey);
        if (docIndex === -1) throw new AppError('NOT_FOUND', `Document "${docKey}" not found on this application`);
        docs[docIndex] = { ...docs[docIndex], verified: true, verifiedAt: new Date(), verifiedBy: ctx.membership!.profileId };
        return toGql(await AdmissionsRepo.updateApplication(tenantId, appId, { documents: docs as never }));
      }

      case 'getUploadUrl':
      case 'POST:/api/admissions/applications/:id/upload-url': {
        authorize(ctx, 'admissions.application.update');
        const key = `${tenantId}/admissions/applications/${args.id}/${args.fileName}`;
        return {
          storageOperation: 'getUploadUrl',
          key,
          contentType: args.contentType ?? 'application/octet-stream',
        };
      }

      // ── Stats ────────────────────────────────────────────────────────────────
      case 'admissionsStats':
      case 'GET:/api/admissions/stats': {
        authorize(ctx, 'admissions.enquiry.read');
        const { Enquiry: EnquiryModel, Application: AppModel } = await import('@vebgenix/db');
        const scopedFilter: Record<string, unknown> = { tenantId };
        if (args.campusId) scopedFilter.campusId = args.campusId;
        if (args.academicYearId) scopedFilter.academicYearId = args.academicYearId;
        const [totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications] =
          await Promise.all([
            EnquiryModel.countDocuments(scopedFilter),
            EnquiryModel.countDocuments({ ...scopedFilter, status: 'NEW' }),
            AppModel.countDocuments(scopedFilter),
            AppModel.countDocuments({ ...scopedFilter, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
            AppModel.countDocuments({ ...scopedFilter, status: 'APPROVED' }),
          ]);
        return { totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications };
      }

      // ── Legacy admission aliases ──────────────────────────────────────────
      case 'listAdmissions': {
        authorize(ctx, 'admissions.application.read');
        const filter: Record<string, unknown> = {};
        if (args.filter) {
          const f = args.filter as Record<string, unknown>;
          if (f.status) filter.status = f.status;
        }
        const apps = await AdmissionsRepo.listApplications(tenantId, filter);
        return {
          edges: (apps as unknown as Array<Record<string, unknown>>).map((a) => ({
            cursor: String(a._id),
            node: { id: String(a._id), studentName: a.studentName ?? a.applicantName ?? '', status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt },
          })),
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      }

      case 'getAdmission': {
        authorize(ctx, 'admissions.application.read');
        const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string) as unknown as Record<string, unknown> | null;
        if (!app) throw new AppError('NOT_FOUND', 'Admission not found');
        return { id: String(app._id), studentName: app.studentName ?? app.applicantName ?? '', status: app.status, createdAt: app.createdAt, updatedAt: app.updatedAt };
      }

      case 'createAdmission': {
        authorize(ctx, 'admissions.application.create');
        const input = (args.input ?? args) as Record<string, unknown>;
        const app = await AdmissionsRepo.createApplication(tenantId, {
          studentName: input.studentName as string,
          phone:       input.phone        as string,
          status:      'DRAFT',
          source:      'ADMIN',
        } as never);
        const a = app as unknown as Record<string, unknown>;
        return { id: String(a._id), studentName: a.studentName ?? '', status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt };
      }

      case 'updateAdmission': {
        authorize(ctx, 'admissions.application.update');
        const input = (args.input ?? args) as Record<string, unknown>;
        const updated = await AdmissionsRepo.updateApplication(tenantId, input.id as string, {
          ...(input.studentName ? { studentName: input.studentName as string } : {}),
          ...(input.status      ? { status:      input.status as never }       : {}),
        } as never) as unknown as Record<string, unknown> | null;
        if (!updated) throw new AppError('NOT_FOUND', 'Admission not found');
        return { id: String(updated._id), studentName: updated.studentName ?? '', status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
      }

      case 'submitAdmission': {
        authorize(ctx, 'admissions.application.update');
        const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string);
        if (!app) throw new AppError('NOT_FOUND', 'Admission not found');
        const updated = await AdmissionsRepo.updateApplication(tenantId, args.id as string, { status: 'SUBMITTED', submittedAt: new Date() }) as unknown as Record<string, unknown>;
        return { id: String(updated._id), studentName: updated.studentName ?? '', status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
      }

      case 'reviewAdmission': {
        const input = (args.input ?? args) as Record<string, unknown>;
        const reviewed = await reviewApplication(ctx, {
          applicationId: args.id as string,
          decision:      input.decision as 'APPROVED' | 'REJECTED',
          remarks:       (input.remarks ?? input.comments) as string | undefined,
        }) as unknown as Record<string, unknown>;
        return { id: String(reviewed._id ?? args.id), studentName: reviewed.studentName ?? '', status: reviewed.status, createdAt: reviewed.createdAt, updatedAt: reviewed.updatedAt };
      }

      case 'withdrawAdmission': {
        authorize(ctx, 'admissions.application.update');
        const updated = await AdmissionsRepo.updateApplication(tenantId, args.id as string, { status: 'WITHDRAWN' as never }) as unknown as Record<string, unknown> | null;
        if (!updated) throw new AppError('NOT_FOUND', 'Admission not found');
        return { id: String(updated._id), studentName: updated.studentName ?? '', status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
      }

      case 'updateAdmissionStatus': {
        authorize(ctx, 'admissions.application.update');
        const updated = await AdmissionsRepo.updateApplication(tenantId, args.id as string, { status: args.status as never }) as unknown as Record<string, unknown> | null;
        if (!updated) throw new AppError('NOT_FOUND', 'Admission not found');
        return { id: String(updated._id), studentName: updated.studentName ?? '', status: updated.status, createdAt: updated.createdAt, updatedAt: updated.updatedAt };
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[admissions-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
