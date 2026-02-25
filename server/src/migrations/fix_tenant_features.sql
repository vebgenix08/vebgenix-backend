-- Fix existing tenant by enabling all features
-- Run this to enable all features for tenant: eaf9fb0c-1d0f-4783-a76e-16a8dce33985

INSERT INTO tenant_features (tenant_id, feature_key, enabled)
VALUES
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'DASHBOARD', true),
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'ADMISSIONS', true),
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'ACADEMICS', true),
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'ATTENDANCE', true),
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'FINANCE', true),
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'HOSTEL', true),
  ('eaf9fb0c-1d0f-4783-a76e-16a8dce33985', 'TRANSPORT', true)
ON CONFLICT (tenant_id, feature_key) 
DO UPDATE SET enabled = true;
