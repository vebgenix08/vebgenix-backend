-- Migration 009: Platform Audit Logs
-- Purpose: Track all platform admin actions for compliance and debugging

-- First, ensure the table doesn't exist
DROP TABLE IF EXISTS platform_audit_logs CASCADE;

-- Create the audit logs table
CREATE TABLE platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  tenant_id uuid,
  campus_id uuid,
  before jsonb DEFAULT '{}'::jsonb,
  after jsonb DEFAULT '{}'::jsonb
);

-- Add foreign key constraints AFTER table creation
-- This allows the migration to succeed even if referenced tables don't exist yet
DO $$
BEGIN
  -- Add FK to platform_users if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_users') THEN
    ALTER TABLE platform_audit_logs 
    ADD CONSTRAINT fk_platform_audit_logs_actor 
    FOREIGN KEY (actor_id) REFERENCES platform_users(id) ON DELETE CASCADE;
  END IF;

  -- Add FK to tenants if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') THEN
    ALTER TABLE platform_audit_logs 
    ADD CONSTRAINT fk_platform_audit_logs_tenant 
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  -- Add FK to campuses if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campuses') THEN
    ALTER TABLE platform_audit_logs 
    ADD CONSTRAINT fk_platform_audit_logs_campus 
    FOREIGN KEY (campus_id) REFERENCES campuses(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor ON platform_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_target ON platform_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_tenant ON platform_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_at ON platform_audit_logs(at DESC);

-- Comments
COMMENT ON TABLE platform_audit_logs IS 'Audit trail for all platform admin actions';
COMMENT ON COLUMN platform_audit_logs.action IS 'Action performed (e.g., CREATE_TENANT, UPDATE_CAMPUS)';
COMMENT ON COLUMN platform_audit_logs.target_type IS 'Type of entity affected (e.g., tenant, campus, profile)';
COMMENT ON COLUMN platform_audit_logs.tenant_id IS 'Tenant context for the action (if applicable)';
COMMENT ON COLUMN platform_audit_logs.campus_id IS 'Campus context for the action (if applicable)';
COMMENT ON COLUMN platform_audit_logs.before IS 'State before action (empty for CREATE)';
COMMENT ON COLUMN platform_audit_logs.after IS 'State after action (empty for DELETE)';
