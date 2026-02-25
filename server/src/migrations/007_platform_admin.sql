-- 1. Platform Users Table
-- Specialized table for Super Admins, separated from tenant profiles.
CREATE TABLE IF NOT EXISTS public.platform_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Platform Audit Logs
-- Audit trail for platform-level actions (e.g., creating tenants).
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at TIMESTAMPTZ DEFAULT NOW(),
  actor_id UUID NOT NULL REFERENCES public.platform_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('TENANT', 'CAMPUS', 'PROFILE', 'FEATURE')),
  target_id UUID,
  meta JSONB DEFAULT '{}'::jsonb
);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_platform_users_updated_at
  BEFORE UPDATE ON public.platform_users
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

-- 4. RLS (Optional but good practice)
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- Super Admins can do everything on these tables
CREATE POLICY "Super Admins full access" ON public.platform_users
  USING (auth.uid() IN (SELECT id FROM public.platform_users WHERE role = 'SUPER_ADMIN'));

CREATE POLICY "Super Admins full access logs" ON public.platform_audit_logs
  USING (auth.uid() IN (SELECT id FROM public.platform_users WHERE role = 'SUPER_ADMIN'));
