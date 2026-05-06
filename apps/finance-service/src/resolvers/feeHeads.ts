import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { CreateFeeHead } from '../use-cases/CreateFeeHead';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

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
      const activeFlag = args.isActive ?? args.activeOnly;
      if (activeFlag === false || activeFlag === 'false') filters.activeOnly = false;
      const docs = await FinanceRepo.listFeeHeadsFiltered(tenantId, filters);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getFeeHead':
    case 'GET:/api/admin/finance/fee-heads/:id':
      authorize(ctx, 'finance.fee_head.read');
      return toGql(await FinanceRepo.findFeeHeadById(tenantId, args.id as string));

    case 'createFeeHead':
    case 'POST:/api/admin/finance/fee-heads': {
      const result = await CreateFeeHead.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof CreateFeeHead.execute>[1]);
      return toGql(result);
    }

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
      return toGql(await FinanceRepo.updateFeeHead(tenantId, id, update));
    }

    case 'deleteFeeHead':
    case 'DELETE:/api/admin/finance/fee-heads/:id': {
      authorize(ctx, 'finance.fee_head.delete');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.findFeeHeadById(tenantId, id);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee head not found');
      return toGql(await FinanceRepo.deleteFeeHead(tenantId, id));
    }

    default:
      return undefined;
  }
}
