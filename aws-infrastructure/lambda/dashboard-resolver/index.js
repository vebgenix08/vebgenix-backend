"use strict";

const { getPrisma }       = require("lambda-shared/db");
const { extractIdentity } = require("lambda-shared/identity");
const { withTenant }      = require("lambda-shared/withTenant");

/**
 * DashboardLambda — AppSync resolver for dashboard queries
 *
 * Handles: superAdminOverview, dashboardOverview
 *
 * Auth: AMAZON_COGNITO_USER_POOLS (default)
 * Identity is extracted via the shared extractIdentity helper which reads
 * custom:global_roles, custom:tenant_id, custom:role injected by the
 * Pre-Token Generation Lambda trigger.
 */
exports.handler = async (event) => {
  // AppSync direct-lambda resolvers may pass fieldName at top level or under info
  const fieldName = event.fieldName ?? event.info?.fieldName;
  const args      = event.arguments ?? event.args ?? {};

  const { userId, tenantId: claimTenantId, isSuperAdmin } = extractIdentity(event.identity);

  console.log(JSON.stringify({ fieldName, userId, claimTenantId, isSuperAdmin }));

  const prisma = await getPrisma();

  try {
    // ── superAdminOverview ──────────────────────────────────────────────────
    if (fieldName === "superAdminOverview") {
      if (!isSuperAdmin) throw new Error("Unauthorized: SUPER_ADMIN access required");
      return await getSuperAdminOverview(prisma);
    }

    // ── dashboardOverview ───────────────────────────────────────────────────
    if (fieldName === "dashboardOverview") {
      const input    = args.input;
      const campusId = input?.campusId;
      if (!campusId) throw new Error("campusId is required");

      // Resolve tenantId — prefer Cognito claim, fall back to DB lookup
      let tenantId = claimTenantId || null;

      if (!tenantId) {
        // Look up the user's active membership (new auth model)
        const membership = await prisma.tenantMembership.findFirst({
          where:   { userId, status: "ACTIVE" },
          select:  { tenantId: true },
          orderBy: { activatedAt: "asc" },
        });
        tenantId = membership?.tenantId ?? null;
      }

      if (!tenantId) {
        // Final fallback: profile table (legacy — for users not yet migrated)
        const profile = await prisma.profile.findFirst({
          where:  { linkedAuthUsers: { some: { authUserId: userId } } },
          select: { tenantId: true },
        });
        tenantId = profile?.tenantId ?? null;
      }

      if (!tenantId) throw new Error("No active tenant found for this user");

      return await getTenantOverview(prisma, tenantId, userId, campusId, input.range);
    }

    throw new Error(`DashboardLambda: unknown field "${fieldName}"`);

  } catch (err) {
    console.error("DashboardLambda Error:", err.message, err.stack);
    throw new Error(err.message || "Internal Error");
  }
};

// ── Super Admin Overview ────────────────────────────────────────────────────

async function getSuperAdminOverview(prisma) {
  const [tenants, users, students, staff, admins] = await Promise.all([
    // Active tenants
    prisma.tenant.count({ where: { isActive: true } }),

    // All registered auth users (new auth model)
    prisma.authUser.count({ where: { status: "ACTIVE" } }),

    // All students across all tenants
    prisma.student.count({ where: { status: "ACTIVE" } }),

    // Staff: active memberships with staff-type roles
    prisma.tenantMembership.count({
      where: {
        status: "ACTIVE",
        role:   { in: ["TEACHER", "STAFF", "ACCOUNTANT"] },
      },
    }),

    // Admins: active memberships with admin roles
    prisma.tenantMembership.count({
      where: {
        status: "ACTIVE",
        role:   { in: ["ORG_OWNER", "ORG_ADMIN"] },
      },
    }),
  ]);

  return { totals: { tenants, users, students, staff, admins } };
}

// ── Tenant Dashboard Overview ───────────────────────────────────────────────

async function getTenantOverview(prisma, tenantId, userId, campusId, range) {
  return await withTenant(prisma, tenantId, userId, async (tx) => {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mtd   = new Date(now.getFullYear(), now.getMonth(), 1);

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
          role:         { in: ["STAFF", "TEACHER"] },
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
      by:    ["status"],
      _count: { status: true },
      where: { campusId },
    });

    const recentApps = await tx.application.findMany({
      where:   { campusId },
      take:    5,
      orderBy: { createdAt: "desc" },
      select:  { id: true, fullName: true, status: true, createdAt: true },
    });

    return {
      totals: {
        activeStudents,
        staff:            staffCount,
        admissionsToday,
        admissionsMTD,
        enquiriesToday,
        applicationsToday,
        approvalsPending,
        attendanceToday:  0,
      },
      admissions: {
        byStatus: funnelStages.map((s) => ({
          status: s.status,
          count:  s._count.status,
        })),
        dailySubmissions: [],
        funnel: funnelStages.map((s) => ({
          status: s.status,
          count:  s._count.status,
        })),
      },
      students: { activeCount: activeStudents },
      fees: {
        isReady:            false,
        collectedThisMonth: 0,
        collectedToday:     0,
        dueTotal:           null,
        collectedDaily:     [],
      },
      recentAdmissions: recentApps.map((a) => ({
        id:          a.id,
        studentName: a.fullName,
        status:      a.status,
        createdAt:   a.createdAt.toISOString(),
      })),
      campusName:  campus?.name   ?? null,
      campusType:  campus?.campusType ?? null,
      generatedAt: now.toISOString(),
    };
  });
}
