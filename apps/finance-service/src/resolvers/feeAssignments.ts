import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { AssignFeeStructure } from '../use-cases/AssignFeeStructure';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

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
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const result = await AssignFeeStructure.execute(ctx, input as unknown as Parameters<typeof AssignFeeStructure.execute>[1]);
      return toGql(result);
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

      const allStudents = await Student.find(
        studentFilter,
        '_id firstName lastName fullName email campusId academicYearId applicationId admissionNo registrationNumber classId',
      ).lean();
      const assigned = await FinanceRepo.listFeeAssignments(
        tenantId,
        academicYearId ? { academicYearId } : {},
      );
      const assignedByStudentId = new Map(
        (assigned as unknown[]).map((assignment) => {
          const plain = toGql(assignment) ?? {};
          return [String(plain.studentId ?? ''), plain];
        }),
      );
      const classIds = Array.from(
        new Set(
          allStudents
            .map((student) => student.classId?.toString())
            .filter((id): id is string => typeof id === 'string' && MongoTypes.ObjectId.isValid(id)),
        ),
      );
      const classDocs = classIds.length
        ? await Class.find({ tenantId, _id: { $in: classIds.map((id) => new MongoTypes.ObjectId(id)) } }, '_id name').lean()
        : [];
      const classNameById = new Map(classDocs.map((classDoc) => [classDoc._id.toString(), classDoc.name]));

      return allStudents
        .filter((student) => !assignedByStudentId.has(student._id.toString()))
        .map((student) => {
          const studentId = student._id.toString();
          const classId = student.classId?.toString();
          const className = classId ? classNameById.get(classId) : undefined;
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
