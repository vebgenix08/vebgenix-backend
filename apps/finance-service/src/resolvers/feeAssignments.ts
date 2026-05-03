import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

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
      authorize(ctx, 'finance.fee_assignment.create');
      return FinanceRepo.createFeeAssignment(tenantId, {
        ...args as object,
        assignedBy: ctx.membership!.profileId,
        status:     'ACTIVE',
      });
    }

    case 'bulkAssignFeeStructure':
    case 'POST:/api/admin/finance/fee-assignments/bulk': {
      authorize(ctx, 'finance.fee_assignment.create');
      const { feeStructureId, academicYearId, classId, studentIds } = args as {
        feeStructureId: string; academicYearId: string; classId?: string; studentIds?: string[];
      };
      // If classId provided, fetch all students in that class and assign
      const ids: string[] = studentIds ?? [];
      if (classId && ids.length === 0) {
        const { Student } = await import('@vebgenix/db');
        const { Types: MongoTypes } = await import('mongoose');
        const students = await Student.find({ tenantId: new MongoTypes.ObjectId(tenantId), classId: new MongoTypes.ObjectId(classId), status: 'ACTIVE' }, '_id');
        ids.push(...students.map((s) => s._id.toString()));
      }
      const results = await Promise.allSettled(
        ids.map((studentId) =>
          FinanceRepo.createFeeAssignment(tenantId, {
            studentId, feeStructureId, academicYearId, classId,
            assignedBy: ctx.membership!.profileId,
            status:     'ACTIVE',
          })
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
      const studentFilter: Record<string, unknown> = { tenantId: new MongoTypes.ObjectId(tenantId), status: 'ACTIVE' };
      if (campusId) studentFilter.campusId = campusId;
      const allStudents = await Student.find(studentFilter, '_id firstName lastName registrationNumber classId').lean();
      // Get all assigned student IDs for this academic year
      const assigned = await FinanceRepo.listFeeAssignments(tenantId, { academicYearId });
      const assignedIds = new Set(assigned.map((a) => a.studentId?.toString()));
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
