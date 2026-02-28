import { PrismaClient } from '@prisma/client';
import { withTenant } from '../../shared/withTenant';
import { subDays, subMonths, format, startOfDay, startOfMonth } from 'date-fns';

const prisma = new PrismaClient();

export const handler = async (event: any) => {
  const { info, arguments: args, identity } = event;
  const fieldName = info.fieldName;
  const claims = identity?.claims || {};
  const userId = claims.sub;
  const groups = claims['cognito:groups'] || [];
  let tenantId = claims['custom:tenant_id'];

  try {
    if (fieldName === 'superAdminOverview') {
      if (!groups.includes('SUPER_ADMIN')) throw new Error('Unauthorized');
      return await getSuperAdminOverview();
    } 
    
    if (fieldName === 'dashboardOverview') {
      const input = args.input;
      const campusId = input.campusId;
      if (!tenantId) {
        const dbUser = await prisma.profile.findUnique({ where: { id: userId }});
        if (!dbUser) throw new Error("User not found");
        tenantId = dbUser.tenantId;
      }
      return await getTenantOverview(tenantId, userId, campusId, input.range);
    }
    throw new Error(`Unknown field: ${fieldName}`);
  } catch (err: any) {
    console.error('DashboardLambda Error:', err);
    throw new Error(err.message || 'Internal Error');
  }
};

async function getSuperAdminOverview() {
  const [tenants, users, students, staff, admins] = await Promise.all([
    prisma.tenant.count(),
    prisma.profile.count(),
    prisma.student.count(),
    prisma.profile.count({ where: { role: { in: ['STAFF', 'TEACHER'] } } }),
    prisma.profile.count({ where: { role: { in: ['ADMIN'] } } }),
  ]);

  return { totals: { tenants, users, students, staff, admins } };
}

async function getTenantOverview(tenantId: string, userId: string, campusId: string, range: any) {
  return await withTenant(prisma, tenantId, userId, async (tx) => {
    const now = new Date();
    const today = startOfDay(now);
    const mtd = startOfMonth(now);

    // Get Campus Info
    const campus = await tx.campus.findUnique({ where: { id: campusId } });

    // 1. Totals / KPIs
    const [
      activeStudents,
      staffCount,
      admissionsToday,
      admissionsMTD,
      enquiriesToday,
      applicationsToday,
      approvalsPending
    ] = await Promise.all([
      tx.student.count({ where: { campusId, status: 'ACTIVE' } }),
      tx.profile.count({ where: { campusAccess: { some: { campusId } }, role: { in: ['STAFF', 'TEACHER'] } } }),
      tx.application.count({ where: { campusId, createdAt: { gte: today }, status: 'APPROVED' } }), // Assuming APPROVED means finalized admission
      tx.application.count({ where: { campusId, createdAt: { gte: mtd }, status: 'APPROVED' } }),
      tx.enquiry.count({ where: { campusId, createdAt: { gte: today } } }),
      tx.application.count({ where: { campusId, createdAt: { gte: today } } }),
      tx.application.count({ where: { campusId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } })
    ]);

    // 2. Admissions Funnel (All Time or per selected range?) - Usually all time for overview
    const funnelStages = await tx.application.groupBy({
      by: ['status'],
      _count: { status: true },
      where: { campusId }
    });

    // 3. Recent Admissions
    const recentApps = await tx.application.findMany({
      where: { campusId },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, fullName: true, status: true, createdAt: true }
    });

    return {
      totals: {
        activeStudents,
        staff: staffCount,
        admissionsToday,
        admissionsMTD,
        enquiriesToday,
        applicationsToday,
        approvalsPending,
        attendanceToday: 0 // Placeholder
      },
      admissions: {
        byStatus: funnelStages.map((s: any) => ({ status: s.status, count: s._count.status })),
        dailySubmissions: [], // Placeholder for now
        funnel: funnelStages.map((s: any) => ({ status: s.status, count: s._count.status }))
      },
      students: { activeCount: activeStudents },
      fees: {
        isReady: false, // Explicitly false as requested
        collectedThisMonth: 0,
        collectedToday: 0,
        dueTotal: null,
        collectedDaily: []
      },
      recentAdmissions: recentApps.map((a: any) => ({
        id: a.id,
        studentName: a.fullName,
        status: a.status,
        createdAt: a.createdAt.toISOString()
      })),
      campusName: campus?.name,
      campusType: campus?.campusType,
      generatedAt: now.toISOString()
    };
  });
}
