import { AuditLog, PlatformAuditLog } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

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
      return AuditLog.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
    }

    case 'listPlatformAuditLogs':
    case 'GET:/api/platform/audit-logs': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const limit  = Math.min((args.limit as number) ?? 50, 200);
      const offset = (args.offset as number) ?? 0;
      return PlatformAuditLog.find({}).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
    }

    case 'getPlatformAuditLog':
    case 'GET:/api/platform/audit-logs/:id': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      return PlatformAuditLog.findById(args.id as string).lean();
    }

    default:
      return undefined;
  }
}
