import { AuditLog, PlatformAuditLog } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import {
  toAuditLogGql,
  toPlatformAuditDetailGql,
  toPlatformAuditListGql,
} from '../settings-utils';

export async function handleAuditLogs(
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
