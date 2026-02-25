-- Migration 004: Add Tenant & Campus to Admissions Tables
-- Safe migration with backfill strategy

-- Step 1: Add nullable columns to enquiries
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS campus_id UUID;

-- Step 2: Add nullable columns to applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS campus_id UUID;

-- Step 3: Add nullable columns to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE students ADD COLUMN IF NOT EXISTS campus_id UUID;

-- Note: Backfill will be done via seed script before adding constraints
-- The seed script will:
-- 1. Create DEFAULT_TENANT and DEFAULT_CAMPUS
-- 2. Update all existing rows with those IDs
-- 3. Then run the constraint migration below

-- This migration file is split - constraints will be added after backfill
