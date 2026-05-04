import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';

export async function resolveFeeCategories(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeCategories':
    case 'GET:/api/admin/finance/fee-categories': {
      authorize(ctx, 'finance.fee_category.read');
      const activeOnly = args.activeOnly !== 'false' && args.activeOnly !== false;
      return FinanceRepo.listFeeCategories(tenantId, activeOnly);
    }

    case 'getFeeCategory':
    case 'GET:/api/admin/finance/fee-categories/:id': {
      authorize(ctx, 'finance.fee_category.read');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const category = await FinanceRepo.findFeeCategoryById(tenantId, id);
      if (!category) throw new AppError('NOT_FOUND', 'Fee category not found');
      return category;
    }

    case 'createFeeCategory':
    case 'POST:/api/admin/finance/fee-categories': {
      authorize(ctx, 'finance.fee_category.create');
      const input = ((args.input as Record<string, string>) ?? args) as Record<string, string>;
      const { name, moduleType, feeType, invoicePrefix, receiptPrefix, defaultAllocationMethod } = input;

      if (!name || !feeType || !invoicePrefix || !receiptPrefix) {
        throw new AppError('BAD_REQUEST', 'name, feeType, invoicePrefix, and receiptPrefix are required');
      }

      const existing = await FinanceRepo.listFeeCategories(tenantId, false);
      if ((existing as { name: string }[]).some(c => c.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError('CONFLICT', `Fee category "${name}" already exists`);
      }

      const category = await FinanceRepo.createFeeCategory(tenantId, {
        name,
        moduleType: (moduleType as 'FEE' | 'BILLING' | 'OTHER') ?? 'FEE',
        feeType: feeType as 'GENERAL' | 'EXAM' | 'ADMISSION' | 'MISC' | 'TRANSPORT' | 'HOSTEL' | 'OTHER',
        invoicePrefix: invoicePrefix.toUpperCase(),
        receiptPrefix: receiptPrefix.toUpperCase(),
        defaultAllocationMethod: (defaultAllocationMethod as 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL') ?? 'PRO_RATA',
        isActive: true,
        createdBy: new Types.ObjectId(ctx.membership!.profileId),
      });

      await AuditLogger.logTenantAction({
        ctx, action: 'FEE_CATEGORY_CREATED',
        entityType: 'FeeCategory', entityId: category._id.toString(), entityName: name,
        after: input as unknown as Record<string, unknown>,
      });

      return category;
    }

    case 'updateFeeCategory':
    case 'PATCH:/api/admin/finance/fee-categories/:id': {
      authorize(ctx, 'finance.fee_category.update');
      const id = args.id as string;
      const { id: _ignored, input: _input, ...restArgs } = args as Record<string, unknown>;
      const update = (_input as Record<string, unknown>) ?? restArgs;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');

      const existing = await FinanceRepo.findFeeCategoryById(tenantId, id as string);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee category not found');

      const updated = await FinanceRepo.updateFeeCategory(tenantId, id as string, update);

      await AuditLogger.logTenantAction({
        ctx, action: 'FEE_CATEGORY_UPDATED',
        entityType: 'FeeCategory', entityId: id as string, entityName: existing.name,
        before: existing.toObject(), after: update,
      });

      return updated;
    }

    case 'deleteFeeCategory':
    case 'DELETE:/api/admin/finance/fee-categories/:id': {
      authorize(ctx, 'finance.fee_category.delete');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');

      const existing = await FinanceRepo.findFeeCategoryById(tenantId, id);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee category not found');

      const deleted = await FinanceRepo.deleteFeeCategoryById(tenantId, id);

      await AuditLogger.logTenantAction({
        ctx, action: 'FEE_CATEGORY_DELETED',
        entityType: 'FeeCategory', entityId: id, entityName: existing.name,
        before: existing.toObject(), after: { isActive: false },
      });

      return deleted;
    }

    default:
      return undefined;
  }
}
