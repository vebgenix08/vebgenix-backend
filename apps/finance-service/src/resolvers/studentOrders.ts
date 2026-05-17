import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { StudentFeeOrderService } from '../services/studentFeeOrder.service';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function resolveStudentOrders(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudentFeeOrders': {
      authorize(ctx, 'finance.invoice.read');
      const { Types: MongoTypes } = require('mongoose');
      const safeOid = (id: string) => { try { return new MongoTypes.ObjectId(id); } catch { return null; } };
      const filter: Record<string, unknown> = { tenant_id: tenantId };
      if (args.studentId) { const oid = safeOid(args.studentId as string); if (oid) filter.student_id = oid; }
      if (args.academicYearId) { const oid = safeOid(args.academicYearId as string); if (oid) filter.academic_year_id = oid; }
      if (args.campusId) { const oid = safeOid(args.campusId as string); if (oid) filter.campus_id = oid; }
      if (args.classId) { const oid = safeOid(args.classId as string); if (oid) filter.class_id = oid; }
      if (args.status) filter.status = args.status;
      const docs = await FinanceRepo.listStudentOrders(filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getStudentFeeOrder':
      authorize(ctx, 'finance.invoice.read');
      return toGql(await StudentFeeOrderService.getById(tenantId, args.id as string));

    case 'generateStudentFeeOrders': {
      authorize(ctx, 'finance.fee_assignment.create');
      const assignment = await FinanceRepo.findFeeAssignmentById(tenantId, args.assignmentId as string);
      if (!assignment) throw new AppError('NOT_FOUND', 'Fee assignment not found');
      const structure = await FinanceRepo.findFeeStructureById(tenantId, String(assignment.feeStructureId));
      if (!structure) throw new AppError('NOT_FOUND', 'Fee structure not found');
      const classId = String(assignment.classId ?? '');
      if (!classId) throw new AppError('BAD_REQUEST', 'Fee assignment is missing classId');
      const mapping = await FinanceRepo.findApplicableFeeStructure(
        tenantId,
        classId,
        String(assignment.academicYearId),
      );
      if (!mapping) throw new AppError('NOT_FOUND', 'Fee structure mapping not found');
      const schedule = await FinanceRepo.findFeeScheduleById(tenantId, String(mapping.feeScheduleId));
      if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      const created = await StudentFeeOrderService.generateFromAssignment(ctx, tenantId, {
        assignment: assignment as never,
        structure: structure as never,
        schedule: schedule as never,
        mapping: mapping as never,
        studentId: String(assignment.studentId),
        campusId: String(mapping.campusId),
        academicYearId: String(assignment.academicYearId),
        classId: String(assignment.classId ?? mapping.classId),
      });
      return (created as unknown[]).map(d => toGql(d));
    }

    case 'updateStudentFeeOrder':
      authorize(ctx, 'finance.invoice.update');
      return toGql(await StudentFeeOrderService.update(tenantId, args.id as string, ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>));

    case 'cancelStudentFeeOrder':
      authorize(ctx, 'finance.invoice.update');
      return !!(await StudentFeeOrderService.cancel(tenantId, args.id as string));

    case 'outstandingReport': {
      authorize(ctx, 'finance.reports.read');
      const docs = await StudentFeeOrderService.listOutstanding(tenantId, {
        studentId: args.studentId as string | undefined,
        classId: args.classId as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
      });
      return (docs as unknown[]).map(d => toGql(d));
    }

    default:
      return undefined;
  }
}
