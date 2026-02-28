-- 1. Create indexes for efficient cursor pagination on platform_audit_logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pal_at_id ON public.platform_audit_logs (at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pal_actor_at_id ON public.platform_audit_logs (actor_id, at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pal_targettype_at_id ON public.platform_audit_logs (target_type, at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pal_targetid_at_id ON public.platform_audit_logs (target_id, at DESC, id DESC);
