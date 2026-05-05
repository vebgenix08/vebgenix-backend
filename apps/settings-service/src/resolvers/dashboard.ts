import { Tenant, Student, Application, Enquiry, Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveDashboard(
  operation: string,
  _args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'dashboardOverview':
    case 'GET:/api/admin/dashboard': {
      const [activeStudents, staff, pendingAdmissions, openEnquiries, admissionsToday] = await Promise.all([
        Student.countDocuments({ tenantId, status: 'ACTIVE' }),
        Profile.countDocuments({ tenantId, personaRole: { $in: ['STAFF', 'TEACHER'] }, isActive: true }),
        Application.countDocuments({ tenantId, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } }),
        Enquiry.countDocuments({ tenantId, status: { $in: ['NEW', 'CONTACTED'] } }),
        Application.countDocuments({
          tenantId,
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
      ]);
      return {
        generatedAt: new Date().toISOString(),
        totals: { activeStudents, staff, admissionsToday, admissionsMTD: pendingAdmissions, enquiriesToday: openEnquiries, applicationsToday: admissionsToday, approvalsPending: pendingAdmissions },
        admissions: { pending: pendingAdmissions, openEnquiries },
        students: { active: activeStudents },
        fees: null,
        recentAdmissions: [],
      };
    }

    case 'superAdminOverview':
    case 'GET:/api/platform/dashboard': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const [totalTenants, totalStudents, activeTenants] = await Promise.all([
        Tenant.countDocuments({}),
        Student.countDocuments({ status: 'ACTIVE' }),
        Tenant.countDocuments({ isActive: true }),
      ]);
      return { totalTenants, activeTenants, totalStudents };
    }

    case 'platformStats':
    case 'GET:/api/platform/stats': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const [tenants, students, activeProfiles] = await Promise.all([
        Tenant.countDocuments({}),
        Student.countDocuments({}),
        Profile.countDocuments({ isActive: true }),
      ]);
      return { tenants, students, activeProfiles };
    }

    default:
      return undefined;
  }
}
