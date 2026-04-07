'use strict';

/**
 * withTenant — mandatory Prisma wrapper for ALL resolver queries.
 *
 * Uses a Prisma interactive transaction to:
 *  1. SET LOCAL app.tenant_id — activates RLS policies for this transaction
 *  2. SET LOCAL app.user_id   — available for audit logging
 *  3. Run the caller's query function inside the protected context
 *
 * SET LOCAL automatically resets on transaction commit/rollback,
 * making this safe for RDS Proxy connection pooling.
 *
 * Usage:
 *   const users = await withTenant(prisma, tenantId, userId, (tx) =>
 *     tx.profile.findMany({ where: { isActive: true } })
 *   );
 */
async function withTenant(prisma, tenantId, userId, fn) {
  if (!tenantId) throw new Error('withTenant: tenantId is required');
  if (!userId)   throw new Error('withTenant: userId is required');

  return prisma.$transaction(async (tx) => {
    // Activate RLS for this transaction — resets automatically on commit/rollback.
    // PostgreSQL SET LOCAL does not support parameterized values ($1), so we must
    // use executeRawUnsafe with string interpolation. tenantId and userId are UUIDs
    // validated before reaching this point, making interpolation safe here.
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
    return fn(tx);
  });
}

module.exports = { withTenant };
