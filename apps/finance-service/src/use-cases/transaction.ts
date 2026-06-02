import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { toGql } from '../finance-utils';

// ── TransactionService (inlined) ──────────────────────────────────────────────

export class TransactionService {
  static async create(tenantId: string, data: Record<string, unknown>) {
    return FinanceRepo.createTransaction(tenantId, data);
  }

  static async bulkCreate(tenantId: string, docs: Record<string, unknown>[]) {
    return FinanceRepo.bulkCreateTransactions(tenantId, docs);
  }

  static async list(tenantId: string, filters: Record<string, unknown> = {}) {
    const toValidOid = (id: unknown) => {
      if (!id) return undefined;
      const s = String(id);
      return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : undefined;
    };
    const cleanFilters: Record<string, unknown> = {};
    const studentOid = toValidOid(filters.studentId);
    if (studentOid) cleanFilters.studentId = studentOid;
    const yearOid = toValidOid(filters.academicYearId);
    if (yearOid) cleanFilters.academicYearId = yearOid;
    return FinanceRepo.listTransactions({ tenantId, ...cleanFilters });
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.getTransactionById(tenantId, id);
  }

  static async dayBook(tenantId: string, from: Date, to: Date, campusId?: string, academicYearId?: string) {
    return FinanceRepo.dayBookReport(tenantId, from, to, campusId, academicYearId);
  }

  static async collectionAnalytics(
    tenantId: string,
    options: { campusId?: string; academicYearId?: string; from?: string; to?: string } = {},
  ) {
    return FinanceRepo.feeCollectionAnalytics(tenantId, options);
  }

  static async classFeeStats(tenantId: string, classId?: string, academicYearId?: string) {
    return FinanceRepo.classFeeStats(tenantId, classId, academicYearId);
  }

  static async studentFinancialSummary(tenantId: string, studentId: string) {
    return FinanceRepo.studentFinancialSummary(tenantId, studentId);
  }

  static async outstandingReport(
    tenantId: string,
    filters: { studentId?: string; classId?: string; academicYearId?: string } = {},
  ) {
    const query: Record<string, unknown> = { tenant_id: tenantId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } };
    if (filters.studentId)    query.student_id       = new Types.ObjectId(filters.studentId);
    if (filters.classId)      query.class_id         = new Types.ObjectId(filters.classId);
    if (filters.academicYearId) query.academic_year_id = new Types.ObjectId(filters.academicYearId);
    return FinanceRepo.listStudentOrders(query);
  }
}

// ── Handler — merges transactions.ts + reports.ts (prefer reports.ts for report ops) ──

export async function handleTransaction(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudentTransactions': {
      authorize(ctx, 'finance.read');
      const docs = await TransactionService.list(tenantId, {
        studentId:      args.studentId,
        academicYearId: args.academicYearId,
      });
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getStudentTransaction':
      authorize(ctx, 'finance.read');
      return toGql(await TransactionService.getById(tenantId, args.id as string));

    case 'createStudentTransaction':
      authorize(ctx, 'finance.collect_payment');
      return toGql(await TransactionService.create(tenantId, ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>));

    // reports.ts version: supports `date` shorthand + uses FinanceRepo directly
    case 'dayBookReport':
    case 'GET:/api/admin/finance/reports/day-book': {
      authorize(ctx, 'finance.read');
      const dateStr  = (args.date ?? args.from) as string | undefined;
      const baseDate = dateStr ? new Date(dateStr) : new Date();
      const from     = new Date(new Date(baseDate).setHours(0, 0, 0, 0));
      const to       = args.to
        ? new Date(new Date(args.to as string).setHours(23, 59, 59, 999))
        : new Date(new Date(baseDate).setHours(23, 59, 59, 999));
      return FinanceRepo.dayBookReport(
        tenantId,
        from,
        to,
        args.campusId       as string | undefined,
        args.academicYearId as string | undefined,
      );
    }

    // reports.ts version: uses FinanceRepo directly
    case 'feeCollectionAnalytics':
    case 'GET:/api/admin/finance/reports/collection-analytics': {
      authorize(ctx, 'finance.reports');
      return FinanceRepo.feeCollectionAnalytics(tenantId, {
        campusId:       args.campusId       as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
        from:           args.from           as string | undefined,
        to:             args.to             as string | undefined,
      });
    }

    // reports.ts version: uses FinanceRepo directly + empty-result guard
    case 'classFeeStats':
    case 'GET:/api/admin/finance/reports/class-stats': {
      authorize(ctx, 'finance.reports');
      const classId        = args.classId        as string | undefined;
      const academicYearId = args.academicYearId as string | undefined;
      const results        = await FinanceRepo.classFeeStats(tenantId, classId, academicYearId);
      if (!results || (Array.isArray(results) && results.length === 0)) {
        return {
          classId:          classId ?? null,
          className:        null,
          totalStudents:    0,
          paidStudents:     0,
          pendingStudents:  0,
          totalAmount:      0,
          collectedAmount:  0,
          pendingAmount:    0,
        };
      }
      return Array.isArray(results) ? results[0] : results;
    }

    // reports.ts version: supports `id` alias for studentId
    case 'studentFinancialSummary':
    case 'GET:/api/admin/finance/students/:studentId/summary': {
      authorize(ctx, 'finance.read');
      const studentId = (args.studentId ?? args.id) as string;
      return FinanceRepo.studentFinancialSummary(tenantId, studentId);
    }

    case 'outstandingReport':
      authorize(ctx, 'finance.reports');
      return TransactionService.outstandingReport(tenantId, {
        studentId:      args.studentId      as string | undefined,
        classId:        args.classId        as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
      });

    default:
      return undefined;
  }
}
