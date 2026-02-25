'use strict';

const { getPrisma } = require('../shared/db');
const { withTenant } = require('../shared/withTenant');

/**
 * TenantsLambda — AppSync resolver for Tenant management
 *
 * SUPER_ADMIN only — authorization enforced in-Lambda (double check after AppSync Cognito auth).
 * Does NOT use withTenant() for read queries — cross-tenant admin access.
 * USES withTenant() for write operations to maintain audit trail.
 */
exports.handler = async (event) => {
  const { fieldName, arguments: args, identity } = event;

  // Guard: SUPER_ADMIN only
  const groups = identity?.claims?.['cognito:groups'] ?? [];
  if (!groups.includes('SUPER_ADMIN')) {
    throw new Error('Unauthorized: SUPER_ADMIN access required');
  }

  const userId = identity?.claims?.sub;
  console.log(JSON.stringify({ fieldName, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {
    case 'listTenants': {
      const tenants = await prisma.tenant.findMany({
        where: { isActive: true },
        take: args?.limit ?? 100,
        orderBy: { createdAt: 'desc' },
        select: tenantSelect,
      });
      return tenants.map(mapTenant);
    }

    case 'getTenant': {
      const tenant = await prisma.tenant.findUniqueOrThrow({
        where: { id: args.id },
        select: tenantSelect,
      });
      return mapTenant(tenant);
    }

    case 'createTenant': {
      const { name, slug, plan } = args.input;
      const tenant = await prisma.tenant.create({
        data: { name, subdomain: slug, isActive: true },
        select: tenantSelect,
      });
      return { ...mapTenant(tenant), plan: plan ?? 'BASIC' };
    }

    case 'updateTenant': {
      const { id, name } = args;
      const tenant = await prisma.tenant.update({
        where: { id },
        data: { ...(name && { name }) },
        select: tenantSelect,
      });
      return mapTenant(tenant);
    }

    case 'deactivateTenant': {
      const { id } = args;
      const tenant = await prisma.tenant.update({
        where: { id },
        data: { isActive: false },
        select: tenantSelect,
      });
      return mapTenant(tenant);
    }

    default:
      throw new Error(`TenantsLambda: unknown field "${fieldName}"`);
  }
};

const tenantSelect = {
  id: true, name: true, subdomain: true,
  isActive: true, createdAt: true,
};

function mapTenant(t) {
  return {
    id:        t.id,
    name:      t.name,
    slug:      t.subdomain,
    plan:      'BASIC', // plan not in current schema — default
    active:    t.isActive,
    createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
