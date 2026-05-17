import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

const safeOid = (id: string | undefined) => Types.ObjectId.isValid(id ?? '') ? new Types.ObjectId(id) : new Types.ObjectId('000000000000000000000000');

export interface FeeComponent {
  feeHeadId:     string;
  feeHeadName:   string;
  amount:        number;
  isOptional?:   boolean;
  priorityOrder?: number;
}

export interface CreateFeeStructureInput {
  campusId:           string;
  academicYearId:     string;
  programId?:         string;
  classId?:           string;
  name:               string;
  components:         FeeComponent[];
  feeCategoryId:      string;
  feeScheduleId?:     string;
  allocationMethod?:  'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';
  studentCategoryId?: string;
}

export class CreateFeeStructure {
  static async execute(ctx: AuthContext, input: CreateFeeStructureInput) {
    authorize(ctx, 'finance.manage');
    const tenantId = getTenantId(ctx);

    if (!input.feeCategoryId) {
      throw new AppError('BAD_REQUEST', 'feeCategoryId is required');
    }
    if (!input.components?.length) {
      throw new AppError('BAD_REQUEST', 'At least one fee component is required');
    }

    // Validate all fee heads belong to the given feeCategoryId
    const feeHeads = await FinanceRepo.listFeeHeadsFiltered(tenantId, { feeCategoryId: input.feeCategoryId });
    const validFeeHeadIds = new Set(
      (feeHeads as { _id: { toString(): string } }[]).map(h => h._id.toString())
    );
    for (const comp of input.components) {
      if (!validFeeHeadIds.has(comp.feeHeadId)) {
        throw new AppError(
          'BAD_REQUEST',
          `Fee head ${comp.feeHeadId} does not belong to fee category ${input.feeCategoryId}`,
        );
      }
    }

    const totalAmount = input.components.reduce((sum, c) => sum + c.amount, 0);

    const structure = await FinanceRepo.createFeeStructure(tenantId, {
      campusId:          new Types.ObjectId(input.campusId),
      academicYearId:    new Types.ObjectId(input.academicYearId),
      programId:         input.programId ? new Types.ObjectId(input.programId) : undefined,
      classId:           input.classId ? new Types.ObjectId(input.classId) : undefined,
      name:              input.name,
      feeCategoryId:     new Types.ObjectId(input.feeCategoryId),
      feeScheduleId:     input.feeScheduleId ? new Types.ObjectId(input.feeScheduleId) : undefined,
      allocationMethod:  input.allocationMethod ?? 'PRO_RATA',
      studentCategoryId: input.studentCategoryId ? new Types.ObjectId(input.studentCategoryId) : undefined,
      components: input.components.map(c => ({
        feeHeadId:     new Types.ObjectId(c.feeHeadId),
        feeHeadName:   c.feeHeadName,
        amount:        c.amount,
        isOptional:    c.isOptional    ?? false,
        priorityOrder: c.priorityOrder ?? 0,
      })),
      totalAmount,
      isActive:  true,
      createdBy: safeOid(ctx.membership?.profileId ?? ctx.userId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'FEE_STRUCTURE_CREATED',
      entityType: 'FeeStructure', entityId: structure._id.toString(), entityName: input.name,
      after: { ...input, totalAmount },
    });

    return structure;
  }
}
