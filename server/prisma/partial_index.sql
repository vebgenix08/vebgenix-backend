CREATE UNIQUE INDEX IF NOT EXISTS tenant_one_primary_admin_active
ON "TenantMembership" ("tenantId")
WHERE "is_primary_admin" = true AND "status" = 'ACTIVE';
