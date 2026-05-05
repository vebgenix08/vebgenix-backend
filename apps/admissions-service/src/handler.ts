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
import { bootstrapDB, ensureDB, AdmissionsRepo } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { CreateEnquiry } from './use-cases/CreateEnquiry';
import { CreateApplication } from './use-cases/CreateApplication';
import { ReviewApplication } from './use-cases/ReviewApplication';
import { Types } from 'mongoose';


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
        const filter: Record<string, unknown> = {};
        if (args.status)   filter.status   = args.status;
        if (args.campusId) filter.campusId  = args.campusId;
        if (args.programId) filter.programId = args.programId;
        return AdmissionsRepo.listEnquiries(tenantId, filter);
      }

      case 'getEnquiry':
      case 'GET:/api/admissions/enquiries/:id':
        authorize(ctx, 'admissions.enquiry.read');
        return AdmissionsRepo.findEnquiryById(tenantId, args.id as string);

      case 'createEnquiry':
      case 'POST:/api/admissions/enquiries':
        return CreateEnquiry.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof CreateEnquiry.execute>[1]);

      case 'updateEnquiry':
      case 'PATCH:/api/admissions/enquiries/:id': {
        authorize(ctx, 'admissions.enquiry.update');
        const { id, ...update } = args as Record<string, unknown>;
        return AdmissionsRepo.updateEnquiry(tenantId, id as string, update);
      }

      case 'deleteEnquiry':
      case 'DELETE:/api/admissions/enquiries/:id':
        authorize(ctx, 'admissions.enquiry.delete');
        return AdmissionsRepo.deleteEnquiry(tenantId, args.id as string);

      case 'checkDuplicate':
      case 'POST:/api/admissions/duplicate-check':
        authorize(ctx, 'admissions.enquiry.read');
        return AdmissionsRepo.findDuplicateEnquiry(tenantId, args.phone as string, args.email as string | undefined);

      // ── Applications ─────────────────────────────────────────────────────────
      case 'listApplications':
      case 'GET:/api/admissions/applications': {
        authorize(ctx, 'admissions.application.read');
        const filter: Record<string, unknown> = {};
        if (args.status)   filter.status   = args.status;
        if (args.campusId) filter.campusId  = args.campusId;
        return AdmissionsRepo.listApplications(tenantId, filter);
      }

      case 'getApprovalQueue':
      case 'GET:/api/admissions/applications/approval-queue': {
        authorize(ctx, 'admissions.application.review');
        return AdmissionsRepo.listApplications(tenantId, {
          status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] },
        });
      }

      case 'getApplication':
      case 'GET:/api/admissions/applications/:id':
        authorize(ctx, 'admissions.application.read');
        return AdmissionsRepo.findApplicationById(tenantId, args.id as string);

      case 'createApplication':
      case 'POST:/api/admissions/applications':
        return CreateApplication.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof CreateApplication.execute>[1]);

      case 'submitApplication':
      case 'POST:/api/admissions/applications/:id/submit': {
        authorize(ctx, 'admissions.application.update');
        const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string);
        if (!app) throw new AppError('NOT_FOUND', 'Application not found');
        if (app.status !== 'DRAFT') throw new AppError('BAD_REQUEST', `Cannot submit — status is ${app.status}`);
        return AdmissionsRepo.updateApplication(tenantId, args.id as string, {
          status: 'SUBMITTED',
          submittedAt: new Date(),
        });
      }

      case 'reviewApplication':
      case 'POST:/api/admissions/applications/:id/review':
        return ReviewApplication.execute(ctx, {
          applicationId: args.id as string,
          ...(args as object),
        } as Parameters<typeof ReviewApplication.execute>[1]);

      case 'getApplicationReviews':
      case 'GET:/api/admissions/applications/:id/reviews': {
        authorize(ctx, 'admissions.application.read');
        const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string);
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
        return AdmissionsRepo.updateApplication(tenantId, args.id as string, { status: 'WITHDRAWN' });
      }

      case 'approveApplication':
      case 'POST:/api/admissions/applications/:id/approve': {
        authorize(ctx, 'admissions.application.approve');
        return AdmissionsRepo.updateApplication(tenantId, args.id as string, {
          status:     'APPROVED',
          approvedAt: new Date(),
          approvedBy: new Types.ObjectId(ctx.membership!.profileId),
        });
      }

      case 'rejectApplication':
      case 'POST:/api/admissions/applications/:id/reject': {
        authorize(ctx, 'admissions.application.approve');
        return AdmissionsRepo.updateApplication(tenantId, args.id as string, {
          status:     'REJECTED',
          rejectedAt: new Date(),
          rejectedBy: new Types.ObjectId(ctx.membership!.profileId),
          rejectionReason: args.reason as string | undefined,
        });
      }

      // ── Document workflow ────────────────────────────────────────────────────
      case 'verifyDocument':
      case 'POST:/api/admissions/applications/:id/documents/:docKey/verify': {
        authorize(ctx, 'admissions.application.review');
        const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string);
        if (!app) throw new AppError('NOT_FOUND', 'Application not found');
        const docKey     = args.docKey as string;
        const docs       = (app.documents ?? []) as unknown as Array<Record<string, unknown>>;
        const docIndex   = docs.findIndex((d) => d.key === docKey || d.type === docKey);
        if (docIndex === -1) throw new AppError('NOT_FOUND', 'Document not found');
        docs[docIndex] = { ...docs[docIndex], verified: true, verifiedAt: new Date(), verifiedBy: ctx.membership!.profileId };
        return AdmissionsRepo.updateApplication(tenantId, args.id as string, { documents: docs as never });
      }

      case 'getUploadUrl':
      case 'POST:/api/admissions/applications/:id/upload-url': {
        authorize(ctx, 'admissions.application.update');
        // Delegates to storage-service — return the storage operation info
        // The client calls storage-service directly for presigned URL generation
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
        const [totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications] =
          await Promise.all([
            EnquiryModel.countDocuments({ tenantId }),
            EnquiryModel.countDocuments({ tenantId, status: 'NEW' }),
            AppModel.countDocuments({ tenantId }),
            AppModel.countDocuments({ tenantId, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
            AppModel.countDocuments({ tenantId, status: 'APPROVED' }),
          ]);
        return { totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications };
      }

      // ── Legacy admission aliases ──────────────────────────────────────────
      // These map the Admission type (id, studentName, status, createdAt, updatedAt)
      // onto the existing Application workflow.

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
          studentName:   input.studentName as string,
          phone:         input.phone        as string,
          status:        'DRAFT',
          source:        'ADMIN',
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
        const reviewed = await ReviewApplication.execute(ctx, {
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
