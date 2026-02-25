/**
 * Grant ADMIN dashboard permissions
 * ─────────────────────────────────
 * Grants dashboard.view, dashboard.view.admissions, dashboard.view.finance
 * to every Profile with role='ADMIN', tenant-wide (campus_id = NULL).
 *
 * Idempotent — safe to run multiple times. Uses ON CONFLICT DO NOTHING
 * against the partial unique index idx_pp_unique_tenant_wide.
 *
 * Usage (standalone):
 *   cd server
 *   npx ts-node --project tsconfig.json scripts/grant-admin-dashboard-perms.ts
 *
 * Also exported as grantAdminDashboardPerms() for programmatic use
 * (e.g. after creating a new tenant or inviting a new ADMIN).
 */

import { PrismaClient } from '@prisma/client';

const DASHBOARD_PERM_KEYS = [
  'dashboard.view',
  'dashboard.view.admissions',
  'dashboard.view.finance',
] as const;

/**
 * Grants the 3 dashboard permissions to every ADMIN profile (tenant-wide).
 * Accepts an optional prismaClient (for transaction / reuse) and optional
 * filters to scope to a single tenant or profile.
 *
 * @param options.prisma  - PrismaClient instance (creates one if omitted)
 * @param options.tenantId  - Scope to a single tenant (optional)
 * @param options.profileId - Scope to a single profile (optional)
 * @returns Number of NEW grants inserted (0 on repeat runs)
 */
export async function grantAdminDashboardPerms(options?: {
  prisma?: PrismaClient;
  tenantId?: string;
  profileId?: string;
}): Promise<number> {
  const ownClient = !options?.prisma;
  const prisma = options?.prisma ?? new PrismaClient();

  try {
    // Build optional WHERE clauses for scoping
    const tenantFilter = options?.tenantId
      ? `AND p.tenant_id = '${options.tenantId}'::uuid`
      : '';
    const profileFilter = options?.profileId
      ? `AND p.id = '${options.profileId}'::uuid`
      : '';

    const result: number = await prisma.$executeRawUnsafe(`
      INSERT INTO public.profile_permissions (id, tenant_id, profile_id, permission_id, campus_id, created_at)
      SELECT
        gen_random_uuid()::TEXT,
        p.tenant_id,
        p.id,
        perm.id,
        NULL::uuid,
        NOW()
      FROM public.profiles p
      CROSS JOIN public.permissions perm
      WHERE p.role = 'ADMIN'
        AND perm.key IN ('dashboard.view', 'dashboard.view.admissions', 'dashboard.view.finance')
        ${tenantFilter}
        ${profileFilter}
      ON CONFLICT DO NOTHING
    `);

    return result;
  } finally {
    if (ownClient) {
      await prisma.$disconnect();
    }
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────────
async function main() {
  console.log('[grant-admin-dashboard-perms] Starting...');
  const inserted = await grantAdminDashboardPerms();
  console.log(
    `[grant-admin-dashboard-perms] Done: ${inserted} new grant(s) inserted.`,
  );
  console.log(
    `[grant-admin-dashboard-perms] Keys: ${DASHBOARD_PERM_KEYS.join(', ')}`,
  );
}

// Run only when executed directly (not imported)
if (require.main === module) {
  main().catch((err) => {
    console.error('[grant-admin-dashboard-perms] Fatal error:', err);
    process.exit(1);
  });
}
