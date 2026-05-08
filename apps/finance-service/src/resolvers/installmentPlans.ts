import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function resolveInstallmentPlans(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listInstallmentPlans':
    case 'GET:/api/admin/finance/installment-plans': {
      authorize(ctx, 'finance.installment_plan.read');
      const docs = await FinanceRepo.listInstallmentPlans(tenantId);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'createInstallmentPlan':
    case 'POST:/api/admin/finance/installment-plans': {
      authorize(ctx, 'finance.installment_plan.create');
      return toGql(await FinanceRepo.createInstallmentPlan(tenantId, { ...args as object, createdBy: ctx.membership!.profileId }));
    }

    case 'updateInstallmentPlan':
    case 'PATCH:/api/admin/finance/installment-plans/:id': {
      authorize(ctx, 'finance.installment_plan.update');
      const { id, ...update } = args as Record<string, unknown>;
      return toGql(await FinanceRepo.updateInstallmentPlan(tenantId, id as string, update));
    }

    case 'deleteInstallmentPlan':
    case 'DELETE:/api/admin/finance/installment-plans/:id':
      authorize(ctx, 'finance.installment_plan.delete');
      return FinanceRepo.deleteInstallmentPlan(tenantId, args.id as string);

    default:
      return undefined;
  }
}
