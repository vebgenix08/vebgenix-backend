import { AuthContext } from '@vebgenix/auth';
import { AdmissionsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export interface ReviewApplicationInput {
  applicationId: string;
  decision: 'APPROVED' | 'REJECTED';
  remarks?: string;
}

export class ReviewApplication {
  static async execute(ctx: AuthContext, input: ReviewApplicationInput) {
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
}
