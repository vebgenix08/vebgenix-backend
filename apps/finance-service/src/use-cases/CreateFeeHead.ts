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
}

export class CreateFeeHead {
  static async execute(ctx: AuthContext, input: CreateFeeHeadInput) {
    authorize(ctx, 'finance.manage');
    const tenantId = getTenantId(ctx);

    const existing = await FinanceRepo.listFeeHeads(tenantId);
    if (existing.some(f => f.name.toLowerCase() === input.name.toLowerCase())) {
      throw new AppError('CONFLICT', `Fee head "${input.name}" already exists`);
    }

    const feeHead = await FinanceRepo.createFeeHead(tenantId, {
      ...input,
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
