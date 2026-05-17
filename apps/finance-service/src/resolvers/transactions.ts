import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { TransactionService } from '../services/transaction.service';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function resolveTransactions(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudentTransactions': {
      authorize(ctx, 'finance.reports.read');
      const docs = await TransactionService.list(tenantId, {
        studentId: args.studentId,
        academicYearId: args.academicYearId,
      });
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getStudentTransaction':
      authorize(ctx, 'finance.reports.read');
      return toGql(await TransactionService.getById(tenantId, args.id as string));

    case 'createStudentTransaction':
      authorize(ctx, 'finance.reports.read');
      return toGql(await TransactionService.create(tenantId, ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>));

    case 'dayBookReport':
      authorize(ctx, 'finance.reports.read');
      return TransactionService.dayBook(
        tenantId,
        new Date(args.from as string),
        new Date(args.to as string),
        args.campusId as string | undefined,
        args.academicYearId as string | undefined,
      );

    case 'feeCollectionAnalytics':
      authorize(ctx, 'finance.reports.read');
      return TransactionService.collectionAnalytics(tenantId, {
        campusId: args.campusId as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
        from: args.from as string | undefined,
        to: args.to as string | undefined,
      });

    case 'classFeeStats': {
      authorize(ctx, 'finance.reports.read');
      const classId = args.classId as string | undefined;
      const results = await TransactionService.classFeeStats(tenantId, classId, args.academicYearId as string | undefined);
      if (!results || (Array.isArray(results) && results.length === 0)) {
        return {
          classId: classId ?? null,
          className: null,
          totalStudents: 0,
          paidStudents: 0,
          pendingStudents: 0,
          totalAmount: 0,
          collectedAmount: 0,
          pendingAmount: 0,
        };
      }
      return Array.isArray(results) ? results[0] : results;
    }

    case 'studentFinancialSummary':
      authorize(ctx, 'finance.reports.read');
      return TransactionService.studentFinancialSummary(tenantId, args.studentId as string);

    case 'outstandingReport':
      authorize(ctx, 'finance.reports.read');
      return TransactionService.outstandingReport(tenantId, {
        studentId: args.studentId as string | undefined,
        classId: args.classId as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
      });

    default:
      return undefined;
  }
}
