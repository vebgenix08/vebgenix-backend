"use strict";

const { getPrisma } = require("../shared/db");

/**
 * AuditLogsLambda — AppSync resolver for platform audit log queries
 *
 * Handles: listPlatformAuditLogs, getPlatformAuditLog
 * Access: SUPER_ADMIN only
 */
exports.handler = async (event) => {
  const { info, arguments: args, identity } = event;
  const fieldName = info.fieldName;
  const claims = identity?.claims || {};
  const groups = claims["cognito:groups"] || [];

  console.log(JSON.stringify({ fieldName }));

  // Authorization: SUPER_ADMIN only
  if (!groups.includes("SUPER_ADMIN")) {
    throw new Error("Unauthorized: SUPER_ADMIN access required");
  }

  const prisma = await getPrisma();

  try {
    if (fieldName === "listPlatformAuditLogs") {
      return await listPlatformAuditLogs(prisma, args.input);
    }

    if (fieldName === "getPlatformAuditLog") {
      return await getPlatformAuditLog(prisma, args.id);
    }

    throw new Error(`Unknown field: ${fieldName}`);
  } catch (err) {
    console.error("AuditLogsLambda Error:", err);
    throw new Error(err.message || "Internal Error");
  }
};

async function listPlatformAuditLogs(prisma, input) {
  const { filter, limit = 25, cursor } = input || {};
  const where = {};

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

  // Cursor-based pagination: (at < cursorAt) OR (at = cursorAt AND id < cursorId)
  if (cursor) {
    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, "base64").toString("utf8"),
      );
      if (decoded.at && decoded.id) {
        where.OR = [
          { at: { lt: new Date(decoded.at) } },
          { at: new Date(decoded.at), id: { lt: decoded.id } },
        ];
      }
    } catch (e) {
      console.warn("Invalid cursor:", e.message);
    }
  }

  const logs = await prisma.platformAuditLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasNextPage = logs.length > limit;
  const edgesData = hasNextPage ? logs.slice(0, limit) : logs;

  const edges = edgesData.map((log) => {
    let metaSummary = null;
    if (log.meta && typeof log.meta === "object") {
      const keys = Object.keys(log.meta);
      if (keys.length > 0) metaSummary = `Keys present: ${keys.join(", ")}`;
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

  return {
    edges,
    pageInfo: {
      nextCursor:
        hasNextPage && edges.length > 0 ? edges[edges.length - 1].cursor : null,
      hasNextPage,
    },
  };
}

async function getPlatformAuditLog(prisma, id) {
  const log = await prisma.platformAuditLog.findUnique({ where: { id } });
  if (!log) throw new Error("Audit log not found");

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
