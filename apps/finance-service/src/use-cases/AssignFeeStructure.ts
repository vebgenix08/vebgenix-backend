import { AuthContext } from '@vebgenix/auth';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { FeeStructureService } from '../services/feeStructure.service';

export interface AssignFeeStructureInput {
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  campusId: string;
  classId?: string;
  discountAmount?: number;
  discountReason?: string;
}

export class AssignFeeStructure {
  static async execute(ctx: AuthContext, input: AssignFeeStructureInput) {
    authorize(ctx, 'finance.fee_assignment.create');
    const tenantId = getTenantId(ctx);

    const result = await FeeStructureService.assignToStudent(ctx, tenantId, {
      studentId: input.studentId,
      classId: input.classId,
      campusId: input.campusId,
      academicYearId: input.academicYearId,
      discountAmount: input.discountAmount,
      discountReason: input.discountReason,
    });

    await AuditLogger.logTenantAction({
      ctx,
      action: 'FEE_ASSIGNED',
      entityType: 'FeeAssignment',
      entityId: result.assignment._id.toString(),
      after: {
        studentId: input.studentId,
        feeStructureId: input.feeStructureId,
        academicYearId: input.academicYearId,
        classId: input.classId ?? result.assignment.classId,
        netAmount: result.assignment.netAmount,
      },
    });

    return result;
  }
}
