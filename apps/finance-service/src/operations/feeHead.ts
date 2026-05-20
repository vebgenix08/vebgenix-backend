import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { safeOid, toGql } from '../shared';
import { normalizeFeePrefix } from '../numbering';

export async function handleFeeHead(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeHeads':
    case 'GET:/api/admin/finance/fee-heads': {
      authorize(ctx, 'finance.fee_head.read');
      const filters: { activeOnly?: boolean } = {};
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
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        name: string;
        type: 'RECURRING' | 'ONE_TIME' | 'OPTIONAL';
        category?: string;
        description?: string;
        code?: string;
        prefix?: string;
        isRefundable?: boolean;
        isMandatory?: boolean;
        allowConcession?: boolean;
        allowLateFee?: boolean;
        priorityOrder?: number;
      };

      authorize(ctx, 'finance.manage');
      const resolvedTenantId = getTenantId(ctx);

      const existing = await FinanceRepo.listFeeHeadsFiltered(resolvedTenantId, { activeOnly: false });
      if ((existing as { name: string }[]).some(f => f.name.toLowerCase() === input.name.toLowerCase())) {
        throw new AppError('CONFLICT', `Fee head "${input.name}" already exists`);
      }

      const code = input.code ? input.code.toUpperCase() : undefined;
      const prefix = normalizeFeePrefix(input.prefix ?? code, input.name);

      const feeHead = await FinanceRepo.createFeeHead(resolvedTenantId, {
        name:           input.name,
        type:           input.type,
        category:       input.category,
        description:    input.description,
        code,
        prefix,
        isRefundable:  input.isRefundable  ?? false,
        isMandatory:   input.isMandatory   ?? true,
        priorityOrder: input.priorityOrder ?? 0,
        createdBy: safeOid(ctx.membership?.profileId ?? ctx.userId),
      });

      await AuditLogger.logTenantAction({
        ctx, action: 'FEE_HEAD_CREATED',
        entityType: 'FeeHead', entityId: feeHead._id.toString(), entityName: input.name,
        after: input as unknown as Record<string, unknown>,
      });

      return toGql(feeHead);
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
