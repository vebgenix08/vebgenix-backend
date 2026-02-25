-- Add first_admin_id column to tenants table
-- This tracks the first admin user created for each tenant

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS first_admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN tenants.first_admin_id IS 'The first admin user created for this tenant during onboarding';
