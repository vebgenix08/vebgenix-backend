import { AuditLog, PlatformAuditLog } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

function toPlatformAuditListGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  return {
    id:          String(plain._id),
    at:          plain.createdAt ? String(plain.createdAt) : new Date().toISOString(),
    actorId:     String(plain.actorId ?? ''),
    action:      plain.action ?? 'UNKNOWN',
    targetType:  plain.entityType ?? 'TENANT',
    targetId:    plain.entityId ?? null,
    metaSummary: plain.metaSummary ?? (plain.entityName ? String(plain.entityName) : null),
  };
}

function toPlatformAuditDetailGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  return {
    id:         String(plain._id),
    at:         plain.createdAt ? String(plain.createdAt) : new Date().toISOString(),
    actorId:    String(plain.actorId ?? ''),
    action:     plain.action ?? 'UNKNOWN',
    targetType: plain.entityType ?? 'TENANT',
    targetId:   plain.entityId ?? null,
    meta:       plain.meta ? JSON.stringify(plain.meta) : null,
  };
}

function toAuditLogGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const before = plain.before as Record<string, unknown> | undefined;
  const after = plain.after as Record<string, unknown> | undefined;
  const meta = JSON.stringify({
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(plain.userAgent ? { userAgent: plain.userAgent } : {}),
  });

  return {
    id: String(plain._id ?? plain.id),
    at: plain.createdAt ?? new Date().toISOString(),
    actorId: plain.userId ? String(plain.userId) : '',
    actorEmail: plain.userEmail ?? null,
    action: plain.action,
    category: plain.entityType ?? null,
    severity: 'INFO',
    targetType: plain.entityType ?? 'Unknown',
    targetId: plain.entityId ?? null,
    targetName: plain.entityName ?? null,
    meta,
    ipAddress: plain.ipAddress ?? null,
  };
}

export async function resolveAuditLogs(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listAuditLogs':
    case 'GET:/api/admin/audit-logs': {
      const inputFilter = (args.filter as Record<string, unknown>) ?? {};
      const limit  = Math.min((args.limit as number) ?? 200, 200);
      const offset = (args.offset as number) ?? 0;
      const filter: Record<string, unknown> = { tenantId };
      const fromAt = inputFilter.fromAt ?? args.fromAt;
      const toAt = inputFilter.toAt ?? args.toAt;
      const campusId = inputFilter.campusId ?? args.campusId;
      const academicYearId = inputFilter.academicYearId ?? args.academicYearId;

      if (inputFilter.action ?? args.action) {
        filter.action = (inputFilter.action ?? args.action) as string;
      }
      if (inputFilter.category ?? args.category) {
        filter.entityType = (inputFilter.category ?? args.category) as string;
      }
      if (inputFilter.targetType ?? args.entityType ?? args.targetType) {
        filter.entityType = (inputFilter.targetType ?? args.entityType ?? args.targetType) as string;
      }
      if (inputFilter.targetId ?? args.targetId) {
        filter.entityId = (inputFilter.targetId ?? args.targetId) as string;
      }
      if (inputFilter.actorId ?? args.profileId ?? args.actorId) {
        filter.userId = (inputFilter.actorId ?? args.profileId ?? args.actorId) as string;
      }
      if (fromAt || toAt) {
        filter.createdAt = {};
        if (fromAt) (filter.createdAt as Record<string, unknown>).$gte = fromAt;
        if (toAt) (filter.createdAt as Record<string, unknown>).$lte = toAt;
      }
      if (campusId || academicYearId) {
        const scopeClauses: Record<string, unknown>[] = [];
        if (campusId) {
          scopeClauses.push({ 'before.campusId': campusId }, { 'after.campusId': campusId });
        }
        if (academicYearId) {
          scopeClauses.push({ 'before.academicYearId': academicYearId }, { 'after.academicYearId': academicYearId });
        }
        if (scopeClauses.length > 0) {
          filter.$or = scopeClauses;
        }
      }
      const docs = await AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return docs.map(d => toAuditLogGql(d));
    }

    case 'listPlatformAuditLogs':
    case 'GET:/api/platform/audit-logs': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const inp    = (args.input as Record<string, unknown>) ?? args;
      const limit  = Math.min((inp.limit as number) ?? (args.limit as number) ?? 25, 200);
      const cursor = (inp.cursor as string | undefined) ?? null;
      const filter = (inp.filter as Record<string, unknown>) ?? {};

      const query: Record<string, unknown> = {};
      if (filter.actorId)    query.actorId    = filter.actorId;
      if (filter.action)     query.action     = filter.action;
      if (filter.targetType) query.entityType = filter.targetType;
      if (filter.targetId)   query.entityId   = filter.targetId;
      if (filter.fromAt || filter.toAt) {
        const dateFilter: Record<string, unknown> = {};
        if (filter.fromAt) dateFilter.$gte = new Date(filter.fromAt as string);
        if (filter.toAt)   dateFilter.$lte = new Date(filter.toAt as string);
        query.createdAt = dateFilter;
      }
      if (cursor) {
        const existing = (query.createdAt as Record<string, unknown>) ?? {};
        query.createdAt = { ...existing, $lt: new Date(cursor) };
      }

      const docs = await PlatformAuditLog.find(query).sort({ createdAt: -1 }).limit(limit + 1).lean();
      const hasNextPage = docs.length > limit;
      const items = hasNextPage ? docs.slice(0, limit) : docs;
      const lastDoc = items[items.length - 1] as Record<string, unknown> | undefined;
      const nextCursor = hasNextPage && lastDoc ? String(lastDoc.createdAt) : null;

      return {
        edges: items.map(d => ({
          cursor: String((d as Record<string, unknown>).createdAt),
          node:   toPlatformAuditListGql(d),
        })),
        pageInfo: { hasNextPage, nextCursor },
      };
    }

    case 'getPlatformAuditLog':
    case 'GET:/api/platform/audit-logs/:id': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      return toPlatformAuditDetailGql(await PlatformAuditLog.findById(args.id as string).lean());
    }

    default:
      return undefined;
  }
}
