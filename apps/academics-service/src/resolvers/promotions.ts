import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AcademicsRepo } from '@vebgenix/db';
import type { AuthContext } from '@vebgenix/auth';
import { PromoteStudents } from '../use-cases/PromoteStudents';
import { getTenantId } from '@vebgenix/tenant';

export async function resolvePromotions(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'promoteStudents':
    case 'POST:/api/admin/academics/promotions': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof PromoteStudents.execute>[1];
      return PromoteStudents.execute(ctx, input);
    }

    case 'listPromotionBatches':
    case 'GET:/api/admin/academics/promotions': {
      authorize(ctx, 'academics.promotion.read');
      const filters: Record<string, unknown> = {};
      if (args.fromAcademicYearId) filters.fromAcademicYearId = args.fromAcademicYearId;
      if (args.toAcademicYearId)   filters.toAcademicYearId   = args.toAcademicYearId;
      if (args.campusId)           filters.campusId           = args.campusId;
      if (args.fromGradeId)        filters.fromGradeId        = args.fromGradeId;
      if (args.status)             filters.status             = args.status;
      return AcademicsRepo.listPromotionBatches(tenantId, filters);
    }

    case 'getPromotionBatch':
    case 'GET:/api/admin/academics/promotions/:id': {
      authorize(ctx, 'academics.promotion.read');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const batch = await AcademicsRepo.findPromotionBatchById(tenantId, id);
      if (!batch) throw new AppError('NOT_FOUND', 'Promotion batch not found');
      return batch;
    }

    case 'listPromotionBatchItems':
    case 'GET:/api/admin/academics/promotions/:id/items': {
      authorize(ctx, 'academics.promotion.read');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      return AcademicsRepo.listPromotionBatchItems(tenantId, id);
    }

    case 'setStudentPromotionEligibility':
    case 'POST:/api/admin/academics/promotion-eligibility': {
      authorize(ctx, 'academics.promotion.create');
      const resolvedTenantId = getTenantId(ctx);
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        academicYearId: string;
        updates: Array<{ studentId: string; eligibility: 'ELIGIBLE' | 'DETAINED' | 'ON_HOLD' }>;
      };
      if (!input.academicYearId) throw new AppError('BAD_REQUEST', 'academicYearId is required');
      if (!input.updates?.length) throw new AppError('BAD_REQUEST', 'updates must not be empty');
      const result = await AcademicsRepo.bulkSetPromotionEligibility(
        resolvedTenantId,
        input.updates.map(u => ({ ...u, academicYearId: input.academicYearId })),
      );
      return { updated: result.modifiedCount ?? 0 };
    }

    default:
      return undefined;
  }
}
