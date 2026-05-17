import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { FeeStructureService } from '../services/feeStructure.service';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function resolveFeeStructureMappings(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeStructureClassMappings': {
      authorize(ctx, 'finance.fee_structure.read');
      const filter: Record<string, unknown> = {};
      if (args.campusId) filter.campusId = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.classId) filter.classId = args.classId;
      if (args.status) filter.status = args.status;
      const docs = await FinanceRepo.listFeeStructureClassMappings(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getFeeStructureClassMapping':
      authorize(ctx, 'finance.fee_structure.read');
      return toGql(await FeeStructureService.getMappingById(tenantId, args.id as string));

    case 'createFeeStructureClassMapping':
    case 'POST:/api/admin/finance/fee-structure-mappings': {
      authorize(ctx, 'finance.fee_structure.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      return toGql(await FeeStructureService.createClassMapping(ctx, tenantId, input as never));
    }

    case 'bulkCreateFeeStructureClassMappings': {
      authorize(ctx, 'finance.fee_structure.create');
      const inputs = (args.input as Record<string, unknown>[]) ?? (args.mappings as Record<string, unknown>[]) ?? [];
      const created = await FinanceRepo.bulkCreateFeeStructureClassMappings(
        tenantId,
        inputs.map(input => ({
          campusId: input.campusId,
          academicYearId: input.academicYearId,
          classId: input.classId,
          feeScheduleId: input.feeScheduleId,
          feeStructureId: input.feeStructureId,
          priority: input.priority ?? 0,
          effectiveFrom: input.effectiveFrom ? new Date(String(input.effectiveFrom)) : undefined,
          effectiveTo: input.effectiveTo ? new Date(String(input.effectiveTo)) : undefined,
          status: input.status ?? 'ACTIVE',
          createdBy: ctx.membership?.profileId ?? ctx.userId,
        })),
      );
      return (created as unknown[]).map(d => toGql(d));
    }

    case 'updateFeeStructureClassMapping':
      authorize(ctx, 'finance.fee_structure.update');
      return toGql(await FeeStructureService.updateClassMapping(tenantId, args.id as string, ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>));

    case 'deleteFeeStructureClassMapping':
      authorize(ctx, 'finance.fee_structure.delete');
      return !!(await FeeStructureService.removeClassMapping(tenantId, args.id as string));

    default:
      return undefined;
  }
}
