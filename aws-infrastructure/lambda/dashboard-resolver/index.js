"use strict";

const { getPrisma } = require("lambda-shared/db");
const { withTenant } = require("lambda-shared/withTenant");

/**
 * DashboardLambda — AppSync resolver for dashboard queries
 *
 * Handles: superAdminOverview, dashboardOverview
 */
exports.handler = async (event) => {
  const { info, arguments: args, identity } = event;
  const fieldName = info.fieldName;

  // Support both auth modes:
  //   USER_POOL  → identity.claims  (Cognito JWT)
  //   LAMBDA     → identity.resolverContext  (our Express JWT, parsed by appsync-authorizer)
  const isLambdaAuth = !!identity?.resolverContext;
  const claims = identity?.claims || {};
  const rc = identity?.resolverContext || {};

  const userId = isLambdaAuth ? rc.userId : claims.sub;
  const globalRoles = isLambdaAuth
    ? JSON.parse(rc.global_roles || "[]") // stored as JSON string
    : claims["cognito:groups"] || [];
  let tenantId = isLambdaAuth ? rc.tenant_id : claims["custom:tenant_id"];

  // Super Admin check works for both modes
  const isSuperAdmin = isLambdaAuth
    ? globalRoles.includes("PLATFORM_SUPER_ADMIN")
    : globalRoles.includes("SUPER_ADMIN");

  console.log(
    JSON.stringify({ fieldName, userId, tenantId, isSuperAdmin, isLambdaAuth }),
  );

  const prisma = await getPrisma();

  try {
    if (fieldName === "superAdminOverview") {
      if (!isSuperAdmin) throw new Error("Unauthorized");
      return await getSuperAdminOverview(prisma);
    }

    if (fieldName === "dashboardOverview") {
      const input = args.input;
      const campusId = input.campusId;
      if (!tenantId) {
        const dbUser = await prisma.profile.findUnique({
          where: { id: userId },
        });
        if (!dbUser) throw new Error("User not found");
        tenantId = dbUser.tenantId;
      }
      return await getTenantOverview(
        prisma,
        tenantId,
        userId,
        campusId,
        input.range,
      );
    }

    throw new Error(`Unknown field: ${fieldName}`);
  } catch (err) {
    console.error("DashboardLambda Error:", err);
    throw new Error(err.message || "Internal Error");
  }
};

async function getSuperAdminOverview(prisma) {
  const [tenants, users, students, staff, admins] = await Promise.all([
    prisma.tenant.count(),
    prisma.profile.count(),
    prisma.student.count(),
    prisma.profile.count({ where: { role: { in: ["STAFF", "TEACHER"] } } }),
    prisma.profile.count({ where: { role: { in: ["ADMIN"] } } }),
  ]);

  return { totals: { tenants, users, students, staff, admins } };
}

async function getTenantOverview(prisma, tenantId, userId, campusId, range) {
  return await withTenant(prisma, tenantId, userId, async (tx) => {
    const now = new Date();
    // Plain JS equivalents of date-fns startOfDay / startOfMonth
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mtd = new Date(now.getFullYear(), now.getMonth(), 1);

    const campus = await tx.campus.findUnique({ where: { id: campusId } });

    const [
      activeStudents,
      staffCount,
      admissionsToday,
      admissionsMTD,
      enquiriesToday,
      applicationsToday,
      approvalsPending,
    ] = await Promise.all([
      tx.student.count({ where: { campusId, status: "ACTIVE" } }),
      tx.profile.count({
        where: {
          campusAccess: { some: { campusId } },
          role: { in: ["STAFF", "TEACHER"] },
        },
      }),
      tx.application.count({
        where: { campusId, createdAt: { gte: today }, status: "APPROVED" },
      }),
      tx.application.count({
        where: { campusId, createdAt: { gte: mtd }, status: "APPROVED" },
      }),
      tx.enquiry.count({ where: { campusId, createdAt: { gte: today } } }),
      tx.application.count({ where: { campusId, createdAt: { gte: today } } }),
      tx.application.count({
        where: { campusId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      }),
    ]);

    const funnelStages = await tx.application.groupBy({
      by: ["status"],
      _count: { status: true },
      where: { campusId },
    });

    const recentApps = await tx.application.findMany({
      where: { campusId },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, fullName: true, status: true, createdAt: true },
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
        attendanceToday: 0,
      },
      admissions: {
        byStatus: funnelStages.map((s) => ({
          status: s.status,
          count: s._count.status,
        })),
        dailySubmissions: [],
        funnel: funnelStages.map((s) => ({
          status: s.status,
          count: s._count.status,
        })),
      },
      students: { activeCount: activeStudents },
      fees: {
        isReady: false,
        collectedThisMonth: 0,
        collectedToday: 0,
        dueTotal: null,
        collectedDaily: [],
      },
      recentAdmissions: recentApps.map((a) => ({
        id: a.id,
        studentName: a.fullName,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
      })),
      campusName: campus?.name,
      campusType: campus?.campusType,
      generatedAt: now.toISOString(),
    };
  });
}
