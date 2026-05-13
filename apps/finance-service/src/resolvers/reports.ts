import { FinanceRepo } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveReports(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'dayBookReport':
    case 'GET:/api/admin/finance/reports/day-book': {
      authorize(ctx, 'finance.reports.read');
      // `date` is a single-day shorthand; `from`/`to` allow custom ranges
      const dateStr = (args.date ?? args.from) as string | undefined;
      const baseDate = dateStr ? new Date(dateStr) : new Date();
      const from = new Date(new Date(baseDate).setHours(0, 0, 0, 0));
      const to   = args.to
        ? new Date(new Date(args.to as string).setHours(23, 59, 59, 999))
        : new Date(new Date(baseDate).setHours(23, 59, 59, 999));
      return FinanceRepo.dayBookReport(
        tenantId,
        from,
        to,
        args.campusId as string | undefined,
        args.academicYearId as string | undefined,
      );
    }

    case 'feeCollectionAnalytics':
    case 'GET:/api/admin/finance/reports/collection-analytics': {
      authorize(ctx, 'finance.reports.read');
      return FinanceRepo.feeCollectionAnalytics(tenantId, {
        campusId: args.campusId as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
        from: args.from as string | undefined,
        to: args.to as string | undefined,
      });
    }

    case 'classFeeStats':
    case 'GET:/api/admin/finance/reports/class-stats': {
      authorize(ctx, 'finance.reports.read');
      const classId        = args.classId        as string | undefined;
      const academicYearId = args.academicYearId as string | undefined;
      return FinanceRepo.classFeeStats(tenantId, classId, academicYearId);
    }

    case 'studentFinancialSummary':
    case 'GET:/api/admin/finance/students/:studentId/summary': {
      authorize(ctx, 'finance.invoice.read');
      const studentId = (args.studentId ?? args.id) as string;
      return FinanceRepo.studentFinancialSummary(tenantId, studentId);
    }

    default:
      return undefined;
  }
}
