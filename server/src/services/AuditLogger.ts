import prisma from '../infrastructure/prisma/client';

/**
 * Platform Audit Logger
 * Logs all platform admin actions for compliance and debugging
 * 
 * RULES:
 * - Every mutation must be logged
 * - Logs written AFTER transaction commits
 * - Never rollback DB because audit log fails
 */

interface AuditLogParams {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  tenantId?: string;
  campusId?: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
}

export class AuditLogger {
  /**
   * Log a platform admin action
   * Called AFTER successful DB transaction
   */
  static async logAction(params: AuditLogParams): Promise<void> {
    const {
      actorId,
      action,
      targetType,
      targetId = null,
      tenantId = null,
      campusId = null,
      before = {},
      after = {}
    } = params;

    try {
      await prisma.platformAuditLog.create({
        data: {
          actorId,
          action,
          targetType,
          targetId,
          meta: {
            tenantId,
            campusId,
            before,
            after
          }
        }
      });
    } catch (err) {
      console.error('[AuditLogger] Unexpected error:', err);
    }
  }

  /**
   * Log multiple actions in batch
   */
  static async logBatch(logs: AuditLogParams[]): Promise<void> {
    try {
      const data = logs.map(log => ({
        actorId: log.actorId,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId || null,
        meta: {
          tenantId: log.tenantId || null,
          campusId: log.campusId || null,
          before: log.before || {},
          after: log.after || {}
        }
      }));

      await prisma.platformAuditLog.createMany({
        data
      });
    } catch (err) {
      console.error('[AuditLogger] Unexpected batch error:', err);
    }
  }
}
