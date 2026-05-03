import { FinanceRepo } from '@vebgenix/db';
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
    case 'GET:/api/admin/finance/fee-heads':
      authorize(ctx, 'finance.fee_head.read');
      return FinanceRepo.listFeeHeads(tenantId, false);

    case 'createFeeHead':
    case 'POST:/api/admin/finance/fee-heads':
      return CreateFeeHead.execute(ctx, args as unknown as Parameters<typeof CreateFeeHead.execute>[1]);

    case 'updateFeeHead':
    case 'PATCH:/api/admin/finance/fee-heads/:id': {
      authorize(ctx, 'finance.fee_head.update');
      const { id, ...update } = args as Record<string, unknown>;
      return FinanceRepo.updateFeeHead(tenantId, id as string, update);
    }

    case 'deleteFeeHead':
    case 'DELETE:/api/admin/finance/fee-heads/:id':
      authorize(ctx, 'finance.fee_head.delete');
      return FinanceRepo.deleteFeeHead(tenantId, args.id as string);

    default:
      return undefined;
  }
}
