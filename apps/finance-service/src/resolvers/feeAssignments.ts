import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { AssignFeeStructure } from '../use-cases/AssignFeeStructure';

export async function resolveFeeAssignments(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeAssignments':
    case 'GET:/api/admin/finance/fee-assignments': {
      authorize(ctx, 'finance.fee_assignment.read');
      const filter: Record<string, unknown> = {};
      if (args.studentId)      filter.studentId      = args.studentId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.classId)        filter.classId        = args.classId;
      return FinanceRepo.listFeeAssignments(tenantId, filter);
    }

    case 'getFeeAssignment':
    case 'GET:/api/admin/finance/fee-assignments/:id':
      authorize(ctx, 'finance.fee_assignment.read');
      return FinanceRepo.findFeeAssignmentById(tenantId, args.id as string);

    case 'getStudentFeeAssignment':
    case 'GET:/api/admin/finance/students/:studentId/fee-assignment': {
      authorize(ctx, 'finance.fee_assignment.read');
      return FinanceRepo.findFeeAssignmentByStudent(
        tenantId,
        args.studentId as string,
        args.academicYearId as string,
      );
    }

    case 'createFeeAssignment':
    case 'POST:/api/admin/finance/fee-assignments': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      return AssignFeeStructure.execute(ctx, input as unknown as Parameters<typeof AssignFeeStructure.execute>[1]);
    }

    case 'bulkAssignFeeStructure':
    case 'POST:/api/admin/finance/fee-assignments/bulk': {
      authorize(ctx, 'finance.fee_assignment.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const { feeStructureId, academicYearId, campusId, classId, studentIds } = input as {
        feeStructureId: string; academicYearId: string; campusId: string; classId?: string; studentIds?: string[];
      };
      const ids: string[] = studentIds ?? [];
      if (classId && ids.length === 0) {
        const { Student } = await import('@vebgenix/db');
        const { Types: MongoTypes } = await import('mongoose');
        const students = await Student.find({ tenantId, classId: new MongoTypes.ObjectId(classId), status: 'ACTIVE' }, '_id');
        ids.push(...students.map((s) => s._id.toString()));
      }
      const results = await Promise.allSettled(
        ids.map((studentId) =>
          AssignFeeStructure.execute(ctx, { studentId, feeStructureId, academicYearId, campusId, classId })
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.filter((r) => r.status === 'rejected').length;
      return { succeeded, failed, total: ids.length };
    }

    case 'getFeeAssignmentQueue':
    case 'GET:/api/admin/finance/fee-assignment-queue': {
      authorize(ctx, 'finance.fee_assignment.read');
      const { Student } = await import('@vebgenix/db');
      const { Types: MongoTypes } = await import('mongoose');
      const academicYearId = args.academicYearId as string;
      const campusId       = args.campusId       as string | undefined;
      // Get all active students
      const studentFilter: Record<string, unknown> = { tenantId, status: 'ACTIVE' };
      if (campusId) studentFilter.campusId = new MongoTypes.ObjectId(campusId);
      const allStudents = await Student.find(studentFilter, '_id firstName lastName fullName registrationNumber classId').lean();
      // Get all assigned student IDs for this academic year
      const assigned = await FinanceRepo.listFeeAssignments(tenantId, { academicYearId });
      const assignedIds = new Set((assigned as { studentId?: { toString(): string } }[]).map((a) => a.studentId?.toString()));
      // Return students without assignment
      return allStudents.filter((s) => !assignedIds.has(s._id.toString()));
    }

    case 'getAssignableFeeStructures':
    case 'GET:/api/admin/finance/assignable-fee-structures': {
      authorize(ctx, 'finance.fee_structure.read');
      // Return fee structures for the given academicYear + program/class combination
      const filter: Record<string, unknown> = {};
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.programId)      filter.programId      = args.programId;
      return FinanceRepo.listFeeStructures(tenantId, filter);
    }

    default:
      return undefined;
  }
}
