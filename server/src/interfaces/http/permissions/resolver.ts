/**
 * Phase 3 — Permission Resolver
 *
 * Loads all ProfilePermission rows for a given tenant+profile
 * and splits them into:
 *   - tenantWideKeys: Set<string>  — grants where campusId IS NULL
 *   - campusKeys: Map<campusId, Set<string>>  — grants WHERE campusId IS NOT NULL
 *
 * Always filters by BOTH tenantId AND profileId to prevent cross-tenant leakage.
 */

import prisma from '../../../infrastructure/prisma/client';

export interface ResolvedPermissions {
  /** All keys granted at the tenant level (campusId = null) */
  tenantWideKeys: Set<string>;
  /** Per-campus keys: Map<campusId, Set<permissionKey>> */
  campusKeys: Map<string, Set<string>>;
  /** Flattened union of all keys — for /me API response only, NOT for enforcement */
  allKeys: string[];
}

export async function resolvePermissions(params: {
  tenantId: string;
  profileId: string;
}): Promise<ResolvedPermissions> {
  const { tenantId, profileId } = params;

  // Raw join — Prisma may not have relations fully introspected yet after manual migration
  const rows = await prisma.$queryRawUnsafe<
    Array<{ key: string; campus_id: string | null }>
  >(
    `SELECT p.key, pp.campus_id
     FROM public.profile_permissions pp
     JOIN public.permissions p ON p.id = pp.permission_id
     WHERE pp.tenant_id = $1::uuid
       AND pp.profile_id = $2::uuid`,
    tenantId,
    profileId,
  );

  const tenantWideKeys = new Set<string>();
  const campusKeys = new Map<string, Set<string>>();
  const seen = new Set<string>(); // for deduplication of allKeys

  for (const row of rows) {
    if (row.campus_id === null) {
      tenantWideKeys.add(row.key);
      seen.add(row.key);
    } else {
      if (!campusKeys.has(row.campus_id)) {
        campusKeys.set(row.campus_id, new Set());
      }
      campusKeys.get(row.campus_id)!.add(row.key);
      seen.add(row.key);
    }
  }

  return {
    tenantWideKeys,
    campusKeys,
    allKeys: Array.from(seen),
  };
}
