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
      const from  = args.from ? new Date(args.from as string) : new Date(new Date().setHours(0, 0, 0, 0));
      const to    = args.to   ? new Date(args.to as string)   : new Date(new Date().setHours(23, 59, 59, 999));
      return FinanceRepo.dayBookReport(tenantId, from, to);
    }

    case 'feeCollectionAnalytics':
    case 'GET:/api/admin/finance/reports/collection-analytics': {
      authorize(ctx, 'finance.reports.read');
      const academicYearId = args.academicYearId as string | undefined;
      return FinanceRepo.feeCollectionAnalytics(tenantId, academicYearId);
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
