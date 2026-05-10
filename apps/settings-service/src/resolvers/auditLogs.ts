import { AuditLog, PlatformAuditLog } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
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
      const limit  = Math.min((args.limit as number) ?? 50, 200);
      const offset = (args.offset as number) ?? 0;
      const filter: Record<string, unknown> = { tenantId };
      if (args.entityType) filter.entityType = args.entityType;
      if (args.profileId)  filter.profileId  = args.profileId;
      const docs = await AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return docs.map(d => toGql(d));
    }

    case 'listPlatformAuditLogs':
    case 'GET:/api/platform/audit-logs': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      // AppSync: args.input = { filter, limit, cursor }  |  REST: args.limit / args.offset
      const inp    = (args.input as Record<string, unknown>) ?? args;
      const limit  = Math.min((inp.limit as number) ?? (args.limit as number) ?? 50, 200);
      const offset = (inp.offset as number) ?? (args.offset as number) ?? 0;
      const docs = await PlatformAuditLog.find({}).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return { edges: docs.map(d => ({ cursor: String((d as Record<string,unknown>)._id), node: toGql(d) })), pageInfo: { hasNextPage: docs.length === limit } };
    }

    case 'getPlatformAuditLog':
    case 'GET:/api/platform/audit-logs/:id': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      return toGql(await PlatformAuditLog.findById(args.id as string).lean());
    }

    default:
      return undefined;
  }
}
