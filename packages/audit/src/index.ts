import { AuditLog, PlatformAuditLog } from '@vebgenix/db';
import { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';

export interface TenantAuditParams {
  ctx: AuthContext;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
}

export interface PlatformAuditParams {
  ctx: AuthContext;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  meta?: Record<string, unknown>;
}

export const AuditLogger = {
  /** Write to tenant-scoped audit_logs collection. Never throws — fire-and-forget. */
  async logTenantAction(params: TenantAuditParams): Promise<void> {
    const tenantId = params.ctx.membership?.tenantId;
    const profileId = params.ctx.membership?.profileId;
    if (!tenantId || !profileId) return;
    try {
      await AuditLog.create({
        tenantId,
        userId:   new Types.ObjectId(profileId),
        userEmail: params.ctx.email,
        action:    params.action,
        entityType:params.entityType,
        entityId:  params.entityId,
        entityName:params.entityName,
        before:    params.before,
        after:     params.after,
        ipAddress: params.ipAddress,
      });
    } catch (err) {
      console.error('[AuditLogger] tenant log failed:', err);
    }
  },

  /** Write to platform-level audit log. Never throws. */
  async logPlatformAction(params: PlatformAuditParams): Promise<void> {
    try {
      await PlatformAuditLog.create({
        actorId:   new Types.ObjectId(params.ctx.userId),
        actorEmail: params.ctx.email,
        action:    params.action,
        entityType:params.entityType,
        entityId:  params.entityId,
        entityName:params.entityName,
        meta:      params.meta,
      });
    } catch (err) {
      console.error('[AuditLogger] platform log failed:', err);
    }
  },
};
