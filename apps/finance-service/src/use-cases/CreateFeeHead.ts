import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export interface CreateFeeHeadInput {
  name: string;
  type: 'RECURRING' | 'ONE_TIME' | 'OPTIONAL';
  description?: string;
  feeCategoryId: string;
  code?: string;
  isRefundable?: boolean;
  isMandatory?: boolean;
  priorityOrder?: number;
}

export class CreateFeeHead {
  static async execute(ctx: AuthContext, input: CreateFeeHeadInput) {
    authorize(ctx, 'finance.manage');
    const tenantId = getTenantId(ctx);

    if (!input.feeCategoryId) {
      throw new AppError('BAD_REQUEST', 'feeCategoryId is required');
    }

    const existing = await FinanceRepo.listFeeHeadsFiltered(tenantId, { activeOnly: false });
    if ((existing as { name: string }[]).some(f => f.name.toLowerCase() === input.name.toLowerCase())) {
      throw new AppError('CONFLICT', `Fee head "${input.name}" already exists`);
    }

    const code = input.code ? input.code.toUpperCase() : undefined;

    const feeHead = await FinanceRepo.createFeeHead(tenantId, {
      ...input,
      feeCategoryId: new Types.ObjectId(input.feeCategoryId),
      code,
      isRefundable:  input.isRefundable  ?? false,
      isMandatory:   input.isMandatory   ?? true,
      priorityOrder: input.priorityOrder ?? 0,
      createdBy: new Types.ObjectId(ctx.membership!.profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'FEE_HEAD_CREATED',
      entityType: 'FeeHead', entityId: feeHead._id.toString(), entityName: input.name,
      after: input as unknown as Record<string, unknown>,
    });

    return feeHead;
  }
}
