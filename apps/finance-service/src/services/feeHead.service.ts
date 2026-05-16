import { Types } from 'mongoose';
import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { normalizeUpper } from '../helpers/finance';

export interface CreateFeeHeadInput {
  name: string;
  type: 'RECURRING' | 'ONE_TIME' | 'OPTIONAL';
  description?: string;
  feeCategoryId: string;
  code?: string;
  prefix?: string;
  isRefundable?: boolean;
  isMandatory?: boolean;
  allowConcession?: boolean;
  allowLateFee?: boolean;
  priorityOrder?: number;
}

export interface UpdateFeeHeadInput extends Partial<CreateFeeHeadInput> {
  isActive?: boolean;
}

export class FeeHeadService {
  static async list(tenantId: string, activeOnly = true) {
    return FinanceRepo.listFeeHeads(tenantId, activeOnly);
  }

  static async listFiltered(
    tenantId: string,
    filters: { feeCategoryId?: string; activeOnly?: boolean } = {},
  ) {
    return FinanceRepo.listFeeHeadsFiltered(tenantId, filters);
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.findFeeHeadById(tenantId, id);
  }

  static async create(ctx: AuthContext, tenantId: string, input: CreateFeeHeadInput) {
    const existing = await FinanceRepo.listFeeHeadsFiltered(tenantId, { activeOnly: false });
    if (existing.some((feeHead: { name: string }) => feeHead.name.toLowerCase() === input.name.toLowerCase())) {
      throw new AppError('CONFLICT', `Fee head "${input.name}" already exists`);
    }

    const code = normalizeUpper(input.code);
    const prefix = normalizeUpper(input.prefix ?? code);

    return FinanceRepo.createFeeHead(tenantId, {
      ...input,
      code,
      prefix,
      feeCategoryId: new Types.ObjectId(input.feeCategoryId),
      isRefundable: input.isRefundable ?? false,
      isMandatory: input.isMandatory ?? true,
      allowConcession: input.allowConcession ?? false,
      allowLateFee: input.allowLateFee ?? false,
      priorityOrder: input.priorityOrder ?? 0,
      createdBy: new Types.ObjectId(ctx.membership!.profileId),
    });
  }

  static async update(tenantId: string, id: string, update: UpdateFeeHeadInput) {
    return FinanceRepo.updateFeeHead(tenantId, id, {
      ...update,
      code: normalizeUpper(update.code),
      prefix: normalizeUpper(update.prefix),
      feeCategoryId: update.feeCategoryId ? new Types.ObjectId(update.feeCategoryId) : undefined,
    });
  }

  static async remove(tenantId: string, id: string) {
    return FinanceRepo.deleteFeeHead(tenantId, id);
  }
}
