import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { CreateFeeStructure } from '../use-cases/CreateFeeStructure';
import { CopyFeePatternToNextYear } from '../use-cases/CopyFeePatternToNextYear';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

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
      if (args.feeCategoryId)  filter.feeCategoryId  = args.feeCategoryId;
      const docs = await FinanceRepo.listFeeStructures(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getFeeStructure':
    case 'GET:/api/admin/finance/fee-structures/:id':
      authorize(ctx, 'finance.fee_structure.read');
      return toGql(await FinanceRepo.findFeeStructureById(tenantId, args.id as string));

    case 'createFeeStructure':
    case 'POST:/api/admin/finance/fee-structures': {
      const result = await CreateFeeStructure.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof CreateFeeStructure.execute>[1]);
      return toGql(result);
    }

    case 'updateFeeStructure':
    case 'PATCH:/api/admin/finance/fee-structures/:id': {
      authorize(ctx, 'finance.fee_structure.update');
      const id = args.id as string;
      const { id: _ignored, input: _input, ...restArgs } = args as Record<string, unknown>;
      const update = (_input as Record<string, unknown>) ?? restArgs;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.findFeeStructureById(tenantId, id);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee structure not found');
      return toGql(await FinanceRepo.updateFeeStructure(tenantId, id, update));
    }

    case 'deleteFeeStructure':
    case 'DELETE:/api/admin/finance/fee-structures/:id':
      authorize(ctx, 'finance.fee_structure.delete');
      return toGql(await FinanceRepo.deleteFeeStructure(tenantId, args.id as string));

    case 'copyFeePatternToNextYear':
    case 'POST:/api/admin/finance/fee-pattern/copy': {
      const result = await CopyFeePatternToNextYear.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof CopyFeePatternToNextYear.execute>[1]);
      return toGql(result);
    }

    default:
      return undefined;
  }
}
