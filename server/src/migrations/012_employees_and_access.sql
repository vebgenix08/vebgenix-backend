-- 012_employees_and_access.sql

-- 1. Enhance profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS all_campuses_access boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_login_at timestamptz NULL;

-- 2. Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_code text NULL,
  phone text NULL,
  designation text NULL,
  department text NULL,
  joined_on date NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT employees_tenant_employee_code_key UNIQUE (tenant_id, employee_code)
);

-- Indexes for employees
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);

-- 3. Create user_campus_access table
CREATE TABLE IF NOT EXISTS user_campus_access (
  id uuid DEFAULT uuid_generate_v7() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT user_campus_access_user_campus_key UNIQUE (user_id, campus_id)
);

-- Indexes for user_campus_access
CREATE INDEX IF NOT EXISTS idx_user_campus_access_tenant_id ON user_campus_access(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_campus_access_user_id ON user_campus_access(user_id);

-- 4. RLS Policies (if RLS is enabled, but we generally use Service Role for admin ops, so this is safety net)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_campus_access ENABLE ROW LEVEL SECURITY;

-- Simple RLS: Tenants can only see their own data
CREATE POLICY "Tenants can view their own employees" ON employees
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Tenants can view their own campus access" ON user_campus_access
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
