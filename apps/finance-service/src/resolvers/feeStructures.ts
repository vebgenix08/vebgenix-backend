import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { CreateFeeStructure } from '../use-cases/CreateFeeStructure';

export async function resolveFeeStructures(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeStructures':
    case 'GET:/api/admin/finance/fee-structures': {
      authorize(ctx, 'finance.fee_structure.read');
      const filter: Record<string, unknown> = {};
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.programId)      filter.programId      = args.programId;
      return FinanceRepo.listFeeStructures(tenantId, filter);
    }

    case 'getFeeStructure':
    case 'GET:/api/admin/finance/fee-structures/:id':
      authorize(ctx, 'finance.fee_structure.read');
      return FinanceRepo.findFeeStructureById(tenantId, args.id as string);

    case 'createFeeStructure':
    case 'POST:/api/admin/finance/fee-structures':
      return CreateFeeStructure.execute(ctx, args as unknown as Parameters<typeof CreateFeeStructure.execute>[1]);

    case 'updateFeeStructure':
    case 'PATCH:/api/admin/finance/fee-structures/:id': {
      authorize(ctx, 'finance.fee_structure.update');
      const { id, ...update } = args as Record<string, unknown>;
      return FinanceRepo.updateFeeStructure(tenantId, id as string, update);
    }

    case 'deleteFeeStructure':
    case 'DELETE:/api/admin/finance/fee-structures/:id':
      authorize(ctx, 'finance.fee_structure.delete');
      return FinanceRepo.deleteFeeStructure(tenantId, args.id as string);

    default:
      return undefined;
  }
}
