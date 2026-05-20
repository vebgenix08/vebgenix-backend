import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../shared';
import { assignFeeStructureToStudent } from './feeStructure';

type StudentQueueDoc = {
  _id: { toString(): string };
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  campusId?: { toString(): string };
  academicYearId?: { toString(): string };
  applicationId?: { toString(): string };
  admissionNo?: string;
  registrationNumber?: string;
  classId?: { toString(): string };
};

export async function handleFeeAssignment(
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
      const docs = await FinanceRepo.listFeeAssignments(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getFeeAssignment':
    case 'GET:/api/admin/finance/fee-assignments/:id':
      authorize(ctx, 'finance.fee_assignment.read');
      return toGql(await FinanceRepo.findFeeAssignmentById(tenantId, args.id as string));

    case 'getStudentFeeAssignment':
    case 'GET:/api/admin/finance/students/:studentId/fee-assignment': {
      authorize(ctx, 'finance.fee_assignment.read');
      return toGql(await FinanceRepo.findFeeAssignmentByStudent(
        tenantId,
        args.studentId as string,
        args.academicYearId as string,
      ));
    }

    case 'createFeeAssignment':
    case 'POST:/api/admin/finance/fee-assignments': {
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        studentId: string;
        feeStructureId: string;
        academicYearId: string;
        campusId: string;
        classId?: string;
        discountAmount?: number;
        discountReason?: string;
      };

      authorize(ctx, 'finance.fee_assignment.create');
      const resolvedTenantId = getTenantId(ctx);

      const result = await assignFeeStructureToStudent(ctx, resolvedTenantId, {
        studentId:      input.studentId,
        classId:        input.classId,
        campusId:       input.campusId,
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
          studentId:      input.studentId,
          feeStructureId: input.feeStructureId,
          academicYearId: input.academicYearId,
          classId:        input.classId ?? result.assignment.classId,
          netAmount:      result.assignment.netAmount,
        },
      });

      return toGql((result as { assignment?: unknown }).assignment ?? result);
    }

    case 'bulkAssignFeeStructure':
    case 'POST:/api/admin/finance/fee-assignments/bulk': {
      authorize(ctx, 'finance.fee_assignment.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const { academicYearId, campusId, classId, studentIds } = input as {
        feeStructureId: string; academicYearId: string; campusId: string; classId?: string; studentIds?: string[];
      };
      const ids: string[] = studentIds ?? [];
      if (classId && ids.length === 0) {
        const { Student } = await import('@vebgenix/db');
        const { Types: MongoTypes } = await import('mongoose');
        const students = (await Student.find({ tenantId, classId: new MongoTypes.ObjectId(classId), status: 'ACTIVE' }, '_id').lean()) as StudentQueueDoc[];
        ids.push(...students.map((student: StudentQueueDoc) => student._id.toString()));
      }
      const resolvedTenantId = getTenantId(ctx);
      const results = await Promise.allSettled(
        ids.map((studentId) =>
          assignFeeStructureToStudent(ctx, resolvedTenantId, { studentId, campusId, academicYearId, classId })
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.filter((r) => r.status === 'rejected').length;
      return { succeeded, failed, total: ids.length };
    }

    case 'getFeeAssignmentQueue':
    case 'GET:/api/admin/finance/fee-assignment-queue': {
      authorize(ctx, 'finance.fee_assignment.read');
      const { Class, Student } = await import('@vebgenix/db');
      const { Types: MongoTypes } = await import('mongoose');
      const academicYearId = args.academicYearId as string | undefined;
      const campusId       = args.campusId       as string | undefined;
      const studentFilter: Record<string, unknown> = { tenantId, status: 'ACTIVE' };
      if (campusId && MongoTypes.ObjectId.isValid(campusId)) {
        studentFilter.campusId = new MongoTypes.ObjectId(campusId);
      }
      if (academicYearId && MongoTypes.ObjectId.isValid(academicYearId)) {
        studentFilter.academicYearId = new MongoTypes.ObjectId(academicYearId);
      }

      const allStudents = (await Student.find(
        studentFilter,
        '_id firstName lastName fullName email campusId academicYearId applicationId admissionNo registrationNumber classId',
      ).lean()) as StudentQueueDoc[];
      const assigned = await FinanceRepo.listFeeAssignments(
        tenantId,
        academicYearId ? { academicYearId } : {},
      );
      const assignedByStudentId = new Map(
        (assigned as unknown[]).map((assignment: unknown) => {
          const plain = toGql(assignment) ?? {};
          return [String(plain.studentId ?? ''), plain];
        }),
      );
      const classIds = Array.from(
        new Set(
          allStudents
            .map((student: StudentQueueDoc) => student.classId?.toString())
            .filter((id): id is string => typeof id === 'string' && MongoTypes.ObjectId.isValid(id)),
        ),
      );
      const classDocs = classIds.length
        ? await Class.find({ tenantId, _id: { $in: classIds.map((id) => new MongoTypes.ObjectId(id)) } }, '_id name').lean()
        : [];
      const classNameById = new Map((classDocs as Array<{ _id: { toString(): string }; name: string }>).map((classDoc) => [classDoc._id.toString(), classDoc.name]));

      return allStudents
        .filter((student: StudentQueueDoc) => !assignedByStudentId.has(student._id.toString()))
        .map((student: StudentQueueDoc) => {
          const studentId  = student._id.toString();
          const classId    = student.classId?.toString();
          const className  = classId ? classNameById.get(classId) : undefined;
          const studentName =
            student.fullName ||
            [student.firstName, student.lastName].filter(Boolean).join(' ') ||
            'Unknown student';

          return {
            studentId,
            id: studentId,
            studentName,
            fullName: studentName,
            email: student.email,
            campusId: student.campusId?.toString(),
            applicationId: student.applicationId?.toString(),
            admissionNo: student.admissionNo,
            registrationNumber: student.registrationNumber,
            classId,
            className,
            currentGrade: className,
            gradeApplyingFor: className,
            academicYear: student.academicYearId?.toString(),
            hasFeeAssignment: false,
            feeAssignment: null,
            currentAssignment: null,
            availableStructures: [],
          };
        });
    }

    case 'getAssignableFeeStructures':
    case 'GET:/api/admin/finance/assignable-fee-structures': {
      authorize(ctx, 'finance.fee_structure.read');
      const filter: Record<string, unknown> = {};
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.programId)      filter.programId      = args.programId;
      const docs = await FinanceRepo.listFeeStructures(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    default:
      return undefined;
  }
}
