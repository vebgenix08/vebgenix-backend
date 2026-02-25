-- Migration 010: Onboarding Status
-- Purpose: Track tenant onboarding completion

ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false;

COMMENT ON COLUMN tenants.onboarding_complete IS 'True when tenant has completed onboarding (campuses, admin, features configured)';
