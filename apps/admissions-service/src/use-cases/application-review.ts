import { AdmissionsRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import { getTenantId } from '@vebgenix/tenant';
import { toGql } from '../admissions-utils';

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
    default:
      return undefined;
  }
}
