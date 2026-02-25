-- Fix profiles foreign key relationship for PostgREST
-- The FK exists but PostgREST can't detect it properly
-- This migration ensures the relationship is properly defined

-- Drop existing FK if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tenant_id_fkey;

-- Re-add with explicit naming
ALTER TABLE profiles 
ADD CONSTRAINT profiles_tenant_id_fkey 
FOREIGN KEY (tenant_id) 
REFERENCES tenants(id) 
ON DELETE RESTRICT;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
