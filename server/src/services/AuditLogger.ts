import { supabase } from '../infrastructure/supabase/client';

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
      const { error } = await supabase
        .from('platform_audit_logs')
        .insert({
          actor_id: actorId,
          action,
          target_type: targetType,
          target_id: targetId,
          tenant_id: tenantId,
          campus_id: campusId,
          before,
          after
        });

      if (error) {
        // Log error but don't throw - audit failure should not break the operation
        console.error('[AuditLogger] Failed to write audit log:', error);
      }
    } catch (err) {
      console.error('[AuditLogger] Unexpected error:', err);
    }
  }

  /**
   * Log multiple actions in batch
   */
  static async logBatch(logs: AuditLogParams[]): Promise<void> {
    try {
      const records = logs.map(log => ({
        actor_id: log.actorId,
        action: log.action,
        target_type: log.targetType,
        target_id: log.targetId || null,
        tenant_id: log.tenantId || null,
        campus_id: log.campusId || null,
        before: log.before || {},
        after: log.after || {}
      }));

      const { error } = await supabase
        .from('platform_audit_logs')
        .insert(records);

      if (error) {
        console.error('[AuditLogger] Failed to write batch audit logs:', error);
      }
    } catch (err) {
      console.error('[AuditLogger] Unexpected batch error:', err);
    }
  }
}
