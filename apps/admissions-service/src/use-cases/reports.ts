import { AdmissionsRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function handleReports(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'admissionsStats':
    case 'GET:/api/admissions/stats': {
      authorize(ctx, 'admissions.enquiry.read');
      const { Enquiry: EnquiryModel, Application: AppModel } = await import('@vebgenix/db');
      const scopedFilter: Record<string, unknown> = { tenantId };
      if (args.campusId) scopedFilter.campusId = args.campusId;
      if (args.academicYearId) scopedFilter.academicYearId = args.academicYearId;
      const [totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications] =
        await Promise.all([
          EnquiryModel.countDocuments(scopedFilter),
          EnquiryModel.countDocuments({ ...scopedFilter, status: 'NEW' }),
          AppModel.countDocuments(scopedFilter),
          AppModel.countDocuments({ ...scopedFilter, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
          AppModel.countDocuments({ ...scopedFilter, status: 'APPROVED' }),
        ]);
      return { totalEnquiries, newEnquiries, totalApplications, pendingApplications, approvedApplications };
    }
    case 'listAdmissions': {
      authorize(ctx, 'admissions.application.read');
      const filter: Record<string, unknown> = {};
      if (args.filter) {
        const f = args.filter as Record<string, unknown>;
        if (f.status) filter.status = f.status;
      }
      const apps = await AdmissionsRepo.listApplications(tenantId, filter);
      return {
        edges: (apps as unknown as Array<Record<string, unknown>>).map((a) => ({
          cursor: String(a._id),
          node: { id: String(a._id), studentName: a.studentName ?? a.applicantName ?? '', status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt },
        })),
        pageInfo: { hasNextPage: false, nextCursor: null },
      };
    }
    case 'getAdmission': {
      authorize(ctx, 'admissions.application.read');
      const app = await AdmissionsRepo.findApplicationById(tenantId, args.id as string) as unknown as Record<string, unknown> | null;
      if (!app) throw new AppError('NOT_FOUND', 'Admission not found');
      return { id: String(app._id), studentName: app.studentName ?? app.applicantName ?? '', status: app.status, createdAt: app.createdAt, updatedAt: app.updatedAt };
    }
    default:
      return undefined;
  }
}
