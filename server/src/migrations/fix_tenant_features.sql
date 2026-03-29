-- Fix existing tenant by enabling all features.
-- On a clean install this should be a no-op if the historical tenant does not exist.

INSERT INTO tenant_features (tenant_id, feature_key, enabled)
SELECT
  tenant.id,
  feature.feature_key,
  true
FROM tenants AS tenant
CROSS JOIN (
  VALUES
    ('DASHBOARD'),
    ('ADMISSIONS'),
    ('ACADEMICS'),
    ('ATTENDANCE'),
    ('FINANCE'),
    ('HOSTEL'),
    ('TRANSPORT')
) AS feature(feature_key)
WHERE tenant.id = 'eaf9fb0c-1d0f-4783-a76e-16a8dce33985'
ON CONFLICT (tenant_id, feature_key)
DO UPDATE SET enabled = true;
