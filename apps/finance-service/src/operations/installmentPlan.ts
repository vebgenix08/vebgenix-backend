import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../shared';

export async function handleInstallmentPlan(
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
      const planInput = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      return toGql(await FinanceRepo.createInstallmentPlan(tenantId, { ...planInput, createdBy: ctx.membership?.profileId ?? ctx.userId }));
    }

    case 'updateInstallmentPlan':
    case 'PATCH:/api/admin/finance/installment-plans/:id': {
      authorize(ctx, 'finance.installment_plan.update');
      const { id, input: planUpdateInput, ...restUpdate } = args as Record<string, unknown>;
      const update = (planUpdateInput as Record<string, unknown>) ?? restUpdate;
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
