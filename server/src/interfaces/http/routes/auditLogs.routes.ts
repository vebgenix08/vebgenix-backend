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
  const details = (log.details ?? {}) as Record<string, any>;
  const profile = profileMap.get(log.userId);

  // Build changeDetails from details.before / details.after if available
  let changeDetails: Array<{ fieldName: string; oldValue: any; newValue: any }> | undefined;
  if (details.before || details.after) {
    const before = (details.before ?? {}) as Record<string, any>;
    const after  = (details.after  ?? {}) as Record<string, any>;
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffs: Array<{ fieldName: string; oldValue: any; newValue: any }> = [];
    for (const key of allKeys) {
      if (before[key] !== after[key]) {
        diffs.push({ fieldName: key, oldValue: before[key], newValue: after[key] });
      }
    }
    if (diffs.length > 0) changeDetails = diffs;
  }

  return {
    _id: log.id,
    userId: log.userId,
    email: profile?.email ?? details.email ?? "—",
    userName: profile?.fullName ?? details.fullName ?? profile?.email ?? "—",
    userRole: profile?.role ?? "—",
    action: log.action,
    module: log.entityType ?? details.module ?? "—",
    status: (details.status === "failure" || details.error) ? "failure" : "success",
    reason: details.error ?? details.reason ?? undefined,
    ipAddress: log.ipAddress ?? details.ipAddress ?? undefined,
    targetEntityType: log.entityType,
    targetEntityId: log.entityId,
    targetEntityName: details.name ?? details.fullName ?? details.studentName ?? null,
    changeDetails,
    createdAt: log.createdAt,
  };
}

// ── Build Prisma where clause ────────────────────────────────────────────────

function buildWhere(query: Record<string, any>, tenantId: string): any {
  const where: any = { tenantId };

  if (query.module && query.module !== "all" && query.module !== "") {
    where.entityType = query.module;
  }

  if (query.action && query.action !== "") {
    where.action = { contains: query.action as string, mode: "insensitive" };
  }

  if (query.userId && query.userId !== "") {
    where.userId = query.userId as string;
  }

  if (query.search && query.search !== "") {
    const s = query.search as string;
    where.OR = [
      { action: { contains: s, mode: "insensitive" } },
      { entityType: { contains: s, mode: "insensitive" } },
    ];
  }

  if (query.startDate || query.endDate) {
    const atFilter: any = {};
    if (query.startDate) atFilter.gte = new Date(query.startDate as string);
    if (query.endDate) {
      const end = new Date(query.endDate as string);
      end.setHours(23, 59, 59, 999);
      atFilter.lte = end;
    }
    where.createdAt = atFilter;
  }

  return where;
}

// ── Hydrate profiles ─────────────────────────────────────────────────────────

async function hydrateProfiles(logs: any[]) {
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
  if (!userIds.length) return new Map<string, any>();
  const profiles = await prisma.profile.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, fullName: true, role: true },
  });
  return new Map(profiles.map((p) => [p.id, p]));
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/audit-logs
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
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.auditLog.count({ where }),
    ]);

    const profileMap = await hydrateProfiles(logs);

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
 */
router.get("/stats/summary", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const where: any = { tenantId };
    if (req.query.startDate) where.createdAt = { gte: new Date(req.query.startDate as string) };
    if (req.query.endDate) {
      const end = new Date(req.query.endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { ...(where.createdAt ?? {}), lte: end };
    }

    const [total, byEntityType] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ["entityType"],
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
        success: total,   // AuditLog doesn't track failures separately
        failure: 0,
        byModule: byEntityType.map((b) => ({ module: b.entityType ?? "Other", count: b._count.id })),
      },
    });
  } catch (err: any) {
    console.error("[AuditLogs] stats error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit-logs/export/csv
 */
router.get("/export/csv", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const where = buildWhere(req.query as Record<string, any>, tenantId);
    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000 });
    const profileMap = await hydrateProfiles(logs);

    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes("\n") || s.includes('"')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = ["Date", "User", "Email", "Action", "Module", "Target ID", "Target Name", "IP Address"];
    const rows = logs.map((log) => {
      const m = mapLog(log, profileMap);
      return [
        new Date(log.createdAt).toLocaleString(),
        m.userName,
        m.email,
        m.action,
        m.module,
        m.targetEntityId ?? "",
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
 */
router.get("/user/:userId", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const page  = Math.max(parseInt((req.query.page  as string) || "1",  10), 1);
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "20", 10), 1), 100);
    const skip  = (page - 1) * limit;

    const where = { tenantId, userId: req.params.userId };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.auditLog.count({ where }),
    ]);

    const profileMap = await hydrateProfiles(logs);
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
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const log = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!log) return res.status(404).json({ error: "Audit log not found" });
    if (log.tenantId !== tenantId) return res.status(403).json({ error: "Access denied" });

    const profileMap = await hydrateProfiles([log]);
    return res.json({ success: true, data: mapLog(log, profileMap) });
  } catch (err: any) {
    console.error("[AuditLogs] detail error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/audit-logs/clear/old
 */
router.delete("/clear/old", requireRole(["ADMIN"]), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const daysOld = Math.max(parseInt((req.query.daysOld as string) || "365", 10), 30);
    const cutoff  = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result  = await prisma.auditLog.deleteMany({ where: { tenantId, createdAt: { lt: cutoff } } });

    return res.json({ success: true, deleted: result.count });
  } catch (err: any) {
    console.error("[AuditLogs] clear error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export { router as auditLogsRouter };
