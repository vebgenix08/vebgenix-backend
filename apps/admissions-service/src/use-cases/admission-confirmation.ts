import { AdmissionsRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { handleApplicationReview } from './application-review';

export async function handleAdmissionConfirmation(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
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
      return handleApplicationReview('reviewApplication', {
        id: args.id,
        input: args.input ?? args,
      }, ctx, tenantId);
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
      return undefined;
  }
}
