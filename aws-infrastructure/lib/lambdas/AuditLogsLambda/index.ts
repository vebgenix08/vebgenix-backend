import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const handler = async (event: any) => {
  const { info, arguments: args, identity } = event;
  const fieldName = info.fieldName;
  const claims = identity?.claims || {};
  const groups = claims["cognito:groups"] || [];

  try {
    // 1) Authorization: Only SUPER_ADMIN can access
    if (!groups.includes("SUPER_ADMIN")) {
      throw new Error("Unauthorized: SUPER_ADMIN access required.");
    }

    if (fieldName === "listPlatformAuditLogs") {
      return await listPlatformAuditLogs(args.input);
    } else if (fieldName === "getPlatformAuditLog") {
      return await getPlatformAuditLog(args.id);
    }

    throw new Error(`Unknown field: ${fieldName}`);
  } catch (err: any) {
    console.error("AuditLogsLambda Error:", err);
    throw new Error(err.message || "Internal Error");
  }
};

async function listPlatformAuditLogs(input: any) {
  const { filter, limit = 25, cursor } = input;

  // Build WHERE clause
  const where: any = {};

  if (filter) {
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.action) where.action = filter.action;
    if (filter.targetType) where.targetType = filter.targetType;
    if (filter.targetId) where.targetId = filter.targetId;
    if (filter.fromAt || filter.toAt) {
      where.at = {};
      if (filter.fromAt) where.at.gte = new Date(filter.fromAt);
      if (filter.toAt) where.at.lte = new Date(filter.toAt);
    }
  }

  // Handle Cursor Pagination
  if (cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, "base64").toString("utf8"),
      );
      if (decoded.at && decoded.id) {
        const cursorAt = new Date(decoded.at);
        const cursorId = decoded.id;

        // (at < cursorAt) OR (at = cursorAt AND id < cursorId)
        where.OR = [
          { at: { lt: cursorAt } },
          { at: cursorAt, id: { lt: cursorId } },
        ];
      }
    } catch (e) {
      console.warn("Invalid cursor provided", e);
    }
  }

  // Query database
  // Note: We use the Prisma model mapped to platform_audit_logs.
  // Assuming the Prisma model is named PlatformAuditLog based on typical conventions.
  const logs = await prisma.platformAuditLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit + 1, // Fetch one extra to determine hasNextPage
  });

  const hasNextPage = logs.length > limit;
  const edgesData = hasNextPage ? logs.slice(0, limit) : logs;

  const edges = edgesData.map((log: any) => {
    // Implement metaSummary: small summary derived from meta keys
    let metaSummary = null;
    if (log.meta && typeof log.meta === "object") {
      const keys = Object.keys(log.meta);
      if (keys.length > 0) {
        metaSummary = `Keys present: ${keys.join(", ")}`;
      }
    }

    return {
      cursor: Buffer.from(
        JSON.stringify({ at: log.at.toISOString(), id: log.id }),
      ).toString("base64"),
      node: {
        id: log.id,
        at: log.at.toISOString(),
        actorId: log.actorId,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metaSummary,
      },
    };
  });

  const nextCursor =
    hasNextPage && edges.length > 0 ? edges[edges.length - 1].cursor : null;

  return {
    edges,
    pageInfo: {
      nextCursor,
      hasNextPage,
    },
  };
}

async function getPlatformAuditLog(id: string) {
  const log = await prisma.platformAuditLog.findUnique({
    where: { id },
  });

  if (!log) {
    throw new Error("Audit log not found");
  }

  return {
    id: log.id,
    at: log.at.toISOString(),
    actorId: log.actorId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    meta: log.meta,
  };
}
