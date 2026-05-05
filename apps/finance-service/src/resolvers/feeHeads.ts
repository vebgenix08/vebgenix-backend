import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { CreateFeeHead } from '../use-cases/CreateFeeHead';

export async function resolveFeeHeads(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeHeads':
    case 'GET:/api/admin/finance/fee-heads': {
      authorize(ctx, 'finance.fee_head.read');
      const filters: { feeCategoryId?: string; activeOnly?: boolean } = {};
      if (args.feeCategoryId) filters.feeCategoryId = args.feeCategoryId as string;
      // schema exposes `isActive`; also accept legacy `activeOnly`
      const activeFlag = args.isActive ?? args.activeOnly;
      if (activeFlag === false || activeFlag === 'false') filters.activeOnly = false;
      return FinanceRepo.listFeeHeadsFiltered(tenantId, filters);
    }

    case 'getFeeHead':
    case 'GET:/api/admin/finance/fee-heads/:id':
      authorize(ctx, 'finance.fee_head.read');
      return FinanceRepo.findFeeHeadById(tenantId, args.id as string);

    case 'createFeeHead':
    case 'POST:/api/admin/finance/fee-heads':
      return CreateFeeHead.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof CreateFeeHead.execute>[1]);

    case 'updateFeeHead':
    case 'PATCH:/api/admin/finance/fee-heads/:id': {
      authorize(ctx, 'finance.fee_head.update');
      const id = args.id as string;
      const { id: _ignored, input: _input, ...restArgs } = args as Record<string, unknown>;
      const update = (_input as Record<string, unknown>) ?? restArgs;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.findFeeHeadById(tenantId, id);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee head not found');
      if (typeof update.code === 'string') update.code = update.code.toUpperCase();
      return FinanceRepo.updateFeeHead(tenantId, id, update);
    }

    case 'deleteFeeHead':
    case 'DELETE:/api/admin/finance/fee-heads/:id': {
      authorize(ctx, 'finance.fee_head.delete');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.findFeeHeadById(tenantId, id);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee head not found');
      return FinanceRepo.deleteFeeHead(tenantId, id);
    }

    default:
      return undefined;
  }
}
