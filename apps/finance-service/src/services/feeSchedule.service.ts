import { Types } from 'mongoose';
import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { validatePercentTotal } from '../helpers/finance';

export interface FeeScheduleSlotInput {
  name: string;
  dueDate: string;
  percentOfTotal?: number;
  fixedAmount?: number;
}

export interface CreateFeeScheduleInput {
  name: string;
  academicYearId: string;
  feeCategoryId?: string;
  campusId?: string;
  collectionType?: 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'PARTIAL_WITH_MINIMUM_AMOUNT' | 'PARTIAL_WITH_MINIMUM_PERCENTAGE';
  minimumAmount?: number;
  minimumPercentage?: number;
  allowPartialPayment?: boolean;
  graceDays?: number;
  lateFeeEnabled?: boolean;
  notificationEnabled?: boolean;
  slots?: FeeScheduleSlotInput[];
}

export interface UpdateFeeScheduleInput extends Partial<CreateFeeScheduleInput> {
  isActive?: boolean;
}

export class FeeScheduleService {
  static async list(tenantId: string, filters: Record<string, unknown> = {}) {
    return FinanceRepo.listFeeSchedules(tenantId, filters);
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.findFeeScheduleById(tenantId, id);
  }

  static async create(ctx: AuthContext, tenantId: string, input: CreateFeeScheduleInput) {
    const slots = (input.slots ?? []).map(slot => ({
      name: slot.name,
      dueDate: new Date(slot.dueDate),
      percentOfTotal: slot.percentOfTotal,
      fixedAmount: slot.fixedAmount,
    }));
    if (slots.length === 0) {
      throw new AppError('BAD_REQUEST', 'At least one installment slot is required');
    }
    validatePercentTotal(slots);

    return FinanceRepo.createFeeSchedule(tenantId, {
      ...input,
      academicYearId: input.academicYearId,
      feeCategoryId: input.feeCategoryId ? new Types.ObjectId(input.feeCategoryId) : undefined,
      campusId: input.campusId ? new Types.ObjectId(input.campusId) : undefined,
      createdBy: ctx.membership!.profileId,
      slots,
    });
  }

  static async update(tenantId: string, id: string, input: UpdateFeeScheduleInput) {
    const slots = input.slots?.map(slot => ({
      name: slot.name,
      dueDate: new Date(slot.dueDate),
      percentOfTotal: slot.percentOfTotal,
      fixedAmount: slot.fixedAmount,
    }));
    if (slots) validatePercentTotal(slots);

    return FinanceRepo.updateFeeSchedule(tenantId, id, {
      ...input,
      feeCategoryId: input.feeCategoryId ? new Types.ObjectId(input.feeCategoryId) : undefined,
      campusId: input.campusId ? new Types.ObjectId(input.campusId) : undefined,
      slots,
    });
  }

  static async remove(tenantId: string, id: string) {
    return FinanceRepo.deleteFeeSchedule(tenantId, id);
  }
}
