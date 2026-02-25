-- 017_add_audit_logs_tenant_id.sql
BEGIN;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

-- Backfill from profiles if possible
UPDATE public.audit_logs al
SET tenant_id = p.tenant_id
FROM public.profiles p
WHERE al.user_id = p.id
  AND al.tenant_id IS NULL;

-- Fallback to earliest tenant for any remaining rows
DO $$
DECLARE
  t uuid;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at ASC LIMIT 1;
  UPDATE public.audit_logs SET tenant_id = t WHERE tenant_id IS NULL;
END $$;

ALTER TABLE public.audit_logs
  ALTER COLUMN tenant_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_tenant_id_fkey') THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON public.audit_logs(tenant_id, created_at DESC);

COMMIT;
