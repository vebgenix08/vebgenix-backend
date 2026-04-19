import { Router, Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// Full auth chain — admin and staff can view logs
router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);
router.use(requireRole(["ADMIN", "STAFF"]));

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapLog(log: any, profileMap: Map<string, any>): any {
  const meta = (log.meta ?? {}) as Record<string, any>;
  const before = (meta.before ?? {}) as Record<string, any>;
  const after = (meta.after ?? {}) as Record<string, any>;

  // Build changeDetails from before/after diff
  const changeDetails: Array<{ fieldName: string; oldValue: any; newValue: any }> = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (before[key] !== after[key]) {
      changeDetails.push({ fieldName: key, oldValue: before[key], newValue: after[key] });
    }
  }

  const profile = profileMap.get(log.actorId);

  return {
    _id: log.id,
    userId: log.actorId,
    email: log.actorEmail ?? profile?.email ?? "—",
    userName: profile?.fullName ?? log.actorEmail ?? "—",
    userRole: profile?.role ?? "—",
    action: log.action,
    module: log.category ?? meta.module ?? "—",
    status: log.severity === "INFO" ? "success" : "failure",
    reason: log.severity !== "INFO" ? (meta.reason ?? log.action) : undefined,
    ipAddress: log.ipAddress ?? meta.ipAddress,
    targetEntityType: log.targetType,
    targetEntityId: log.targetId,
    targetEntityName: log.targetName ?? meta.name ?? null,
    changeDetails: changeDetails.length > 0 ? changeDetails : undefined,
    createdAt: log.at,
  };
}

// ── Build Prisma where clause from query params ──────────────────────────────

function buildWhere(query: Record<string, any>, tenantId: string): any {
  // Always scope to tenant via JSON path — put everything inside AND[] for clean composition
  const andClauses: any[] = [
    { meta: { path: ["tenantId"], equals: tenantId } },
  ];

  if (query.module && query.module !== "all" && query.module !== "") {
    andClauses.push({ category: query.module });
  }

  if (query.action && query.action !== "") {
    andClauses.push({ action: { contains: query.action as string, mode: "insensitive" } });
  }

  if (query.userId && query.userId !== "") {
    andClauses.push({ actorId: query.userId as string });
  }

  if (query.status && query.status !== "" && query.status !== "all") {
    if (query.status === "success") {
      andClauses.push({ severity: "INFO" });
    } else {
      andClauses.push({ severity: { in: ["ERROR", "WARN"] } });
    }
  }

  if (query.search && query.search !== "") {
    const s = query.search as string;
    andClauses.push({
      OR: [
        { action: { contains: s, mode: "insensitive" } },
        { actorEmail: { contains: s, mode: "insensitive" } },
        { targetName: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  if (query.startDate || query.endDate) {
    const atFilter: any = {};
    if (query.startDate) atFilter.gte = new Date(query.startDate as string);
    if (query.endDate) {
      const end = new Date(query.endDate as string);
      end.setHours(23, 59, 59, 999);
      atFilter.lte = end;
    }
    andClauses.push({ at: atFilter });
  }

  return { AND: andClauses };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/audit-logs
 * List audit logs for the current tenant with pagination & filters.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const page  = Math.max(parseInt((req.query.page  as string) || "1",  10), 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "20", 10), 1), 200);
    const skip  = (page - 1) * limit;

    const where = buildWhere(req.query as Record<string, any>, tenantId);

    const [logs, total] = await Promise.all([
      prisma.platformAuditLog.findMany({
        where,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.platformAuditLog.count({ where }),
    ]);

    // Hydrate actor names from Profile
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))];
    const profiles = actorIds.length
      ? await prisma.profile.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, fullName: true, role: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    return res.json({
      success: true,
      data: logs.map((log) => mapLog(log, profileMap)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error("[AuditLogs] list error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit-logs/stats/summary
 * Return aggregate counts for the dashboard.
 */
router.get("/stats/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const where: any = { meta: { path: ["tenantId"], equals: tenantId } };
    if (req.query.startDate) where.at = { gte: new Date(req.query.startDate as string) };
    if (req.query.endDate) {
      const end = new Date(req.query.endDate as string);
      end.setHours(23, 59, 59, 999);
      where.at = { ...(where.at ?? {}), lte: end };
    }

    const [total, failures, byCategory] = await Promise.all([
      prisma.platformAuditLog.count({ where }),
      prisma.platformAuditLog.count({ where: { ...where, severity: { in: ["ERROR", "WARN"] } } }),
      prisma.platformAuditLog.groupBy({
        by: ["category"],
        where,
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        success: total - failures,
        failure: failures,
        byModule: byCategory.map((b) => ({ module: b.category ?? "Other", count: b._count.id })),
      },
    });
  } catch (err: any) {
    console.error("[AuditLogs] stats error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit-logs/export/csv
 * Export filtered logs as CSV blob.
 */
router.get("/export/csv", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const where = buildWhere(req.query as Record<string, any>, tenantId);

    const logs = await prisma.platformAuditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: 5000,
    });

    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))];
    const profiles = actorIds.length
      ? await prisma.profile.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, fullName: true, role: true },
        })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes("\n") || s.includes('"')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = ["Date", "User", "Email", "Action", "Module", "Status", "Target Type", "Target Name", "IP Address"];
    const rows = logs.map((log) => {
      const m = mapLog(log, profileMap);
      return [
        new Date(log.at).toLocaleString(),
        m.userName,
        m.email,
        m.action,
        m.module,
        m.status,
        m.targetEntityType ?? "",
        m.targetEntityName ?? "",
        m.ipAddress ?? "",
      ].map(escape).join(",");
    });

    const csv = [header.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit_logs_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err: any) {
    console.error("[AuditLogs] export error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit-logs/user/:userId
 * Get activity for a specific user.
 */
router.get("/user/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const page  = Math.max(parseInt((req.query.page  as string) || "1",  10), 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "20", 10), 1), 100);
    const skip  = (page - 1) * limit;

    const where: any = {
      actorId: req.params.userId,
      meta: { path: ["tenantId"], equals: tenantId },
    };

    const [logs, total] = await Promise.all([
      prisma.platformAuditLog.findMany({
        where,
        orderBy: [{ at: "desc" }],
        skip,
        take: limit,
      }),
      prisma.platformAuditLog.count({ where }),
    ]);

    const profile = await prisma.profile.findUnique({
      where: { id: req.params.userId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    const profileMap = new Map(profile ? [[profile.id, profile]] : []);

    return res.json({
      success: true,
      data: logs.map((log) => mapLog(log, profileMap)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error("[AuditLogs] user activity error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit-logs/:id
 * Get single audit log detail.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const log = await prisma.platformAuditLog.findUnique({ where: { id: req.params.id } });
    if (!log) return res.status(404).json({ error: "Audit log not found" });

    // Verify this log belongs to the requester's tenant
    const meta = (log.meta ?? {}) as Record<string, any>;
    if (meta.tenantId && meta.tenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: log.actorId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    const profileMap = new Map(profile ? [[profile.id, profile]] : []);

    return res.json({ success: true, data: mapLog(log, profileMap) });
  } catch (err: any) {
    console.error("[AuditLogs] detail error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/audit-logs/clear/old
 * Delete logs older than N days.
 */
router.delete("/clear/old", requireRole(["ADMIN"]), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const daysOld = Math.max(parseInt((req.query.daysOld as string) || "365", 10), 30);
    const cutoff  = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await prisma.platformAuditLog.deleteMany({
      where: {
        at: { lt: cutoff },
        meta: { path: ["tenantId"], equals: tenantId },
      },
    });

    return res.json({ success: true, deleted: result.count });
  } catch (err: any) {
    console.error("[AuditLogs] clear error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export { router as auditLogsRouter };
