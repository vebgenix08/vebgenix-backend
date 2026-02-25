'use strict';

/**
 * AdminLambda — AppSync resolver for Admin (SUPER_ADMIN) platform ops
 */
exports.handler = async (event) => {
  const { fieldName, identity } = event;

  const groups = identity?.claims?.['cognito:groups'] ?? [];
  if (!groups.includes('SUPER_ADMIN')) {
    throw new Error('Unauthorized: SUPER_ADMIN access required');
  }

  switch (fieldName) {
    case 'platformStats':
      // TODO: Aggregate from DB — no tenant context needed (cross-tenant admin query)
      return {
        totalTenants: 0,
        totalUsers: 0,
        totalAdmissions: 0,
        activeTenantsLast30Days: 0,
      };

    default:
      throw new Error(`AdminLambda: unknown field "${fieldName}"`);
  }
};
