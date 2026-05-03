import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { Types } from 'mongoose';

export interface FeeComponent {
  feeHeadId: string;
  feeHeadName: string;
  amount: number;
  isOptional?: boolean;
}

export interface CreateFeeStructureInput {
  campusId: string;
  academicYearId: string;
  programId?: string;
  classId?: string;
  name: string;
  components: FeeComponent[];
}

export class CreateFeeStructure {
  static async execute(ctx: AuthContext, input: CreateFeeStructureInput) {
    authorize(ctx, 'finance.manage');
    const tenantId = getTenantId(ctx);

    const totalAmount = input.components.reduce((sum, c) => sum + c.amount, 0);

    const structure = await FinanceRepo.createFeeStructure(tenantId, {
      campusId:       new Types.ObjectId(input.campusId),
      academicYearId: new Types.ObjectId(input.academicYearId),
      programId:      input.programId ? new Types.ObjectId(input.programId) : undefined,
      classId:        input.classId ? new Types.ObjectId(input.classId) : undefined,
      name:           input.name,
      components: input.components.map(c => ({
        feeHeadId:   new Types.ObjectId(c.feeHeadId),
        feeHeadName: c.feeHeadName,
        amount:      c.amount,
        isOptional:  c.isOptional ?? false,
      })),
      totalAmount,
      isActive: true,
      createdBy: new Types.ObjectId(ctx.membership!.profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'FEE_STRUCTURE_CREATED',
      entityType: 'FeeStructure', entityId: structure._id.toString(), entityName: input.name,
      after: { ...input, totalAmount },
    });

    return structure;
  }
}
