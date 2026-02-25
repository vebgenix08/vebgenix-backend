/**
 * Phase 2 — Backfill personaRole + staffType from existing UserRole
 * Safe to run multiple times (idempotent): only updates where persona_role IS NULL.
 *
 * Fix: PostgreSQL requires explicit text->enum cast when using parameterized queries.
 * We use ($1::text)::"PersonaRole" to safely coerce the string param to the enum type.
 *
 * Usage:
 *   cd server
 *   npx ts-node --project tsconfig.json scripts/backfill-personaRole.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping from existing UserRole to PersonaRole + optional StaffType
const ROLE_MAP: Record<string, { personaRole: string; staffType?: string }> = {
  ADMIN:      { personaRole: 'TENANT_ADMIN' },
  ACCOUNTANT: { personaRole: 'STAFF', staffType: 'ACCOUNTANT' },
  STAFF:      { personaRole: 'STAFF', staffType: 'OTHER' },
  TEACHER:    { personaRole: 'STAFF', staffType: 'TEACHER' },
  STUDENT:    { personaRole: 'STUDENT' },
  PARENT:     { personaRole: 'PARENT' },
};

// Whitelist of valid enum values — prevents SQL injection
const VALID_PERSONA_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN', 'STAFF', 'STUDENT', 'PARENT']);
const VALID_STAFF_TYPES   = new Set(['PRINCIPAL', 'HOD', 'TEACHER', 'ACCOUNTANT', 'CLERK', 'OTHER']);

async function backfill() {
  console.log('[backfill-personaRole] Starting...');

  // Only fetch profiles where personaRole is still NULL
  const profiles = await prisma.$queryRawUnsafe<Array<{ id: string; role: string }>>(
    `SELECT id, role FROM public.profiles WHERE persona_role IS NULL`,
  );

  if (profiles.length === 0) {
    console.log('[backfill-personaRole] Complete: 0 profiles needed update (all already backfilled).');
    await prisma.$disconnect();
    return;
  }

  console.log(`[backfill-personaRole] Found ${profiles.length} profile(s) to update...`);

  let updated = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const mapping = ROLE_MAP[profile.role];

    if (!mapping) {
      console.warn(`[backfill-personaRole] Unknown role "${profile.role}" for profile ${profile.id} — skipping`);
      skipped++;
      continue;
    }

    // Validate against whitelist (safety guard)
    if (!VALID_PERSONA_ROLES.has(mapping.personaRole)) {
      console.warn(`[backfill-personaRole] Invalid personaRole "${mapping.personaRole}" — skipping`);
      skipped++;
      continue;
    }
    if (mapping.staffType && !VALID_STAFF_TYPES.has(mapping.staffType)) {
      console.warn(`[backfill-personaRole] Invalid staffType "${mapping.staffType}" — skipping`);
      skipped++;
      continue;
    }

    // Use ($1::text)::"PersonaRole" to safely cast text param to the custom enum type.
    // We cannot use $1::"PersonaRole" directly — PostgreSQL requires explicit text cast first.
    if (mapping.staffType) {
      await prisma.$executeRawUnsafe(
        `UPDATE public.profiles
         SET persona_role = ($1::text)::"PersonaRole",
             staff_type   = ($2::text)::"StaffType"
         WHERE id = ($3::text)::uuid`,
        mapping.personaRole,
        mapping.staffType,
        profile.id,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE public.profiles
         SET persona_role = ($1::text)::"PersonaRole"
         WHERE id = ($2::text)::uuid`,
        mapping.personaRole,
        profile.id,
      );
    }

    updated++;
  }

  console.log(`[backfill-personaRole] Complete: ${updated} profile(s) updated, ${skipped} skipped.`);
  await prisma.$disconnect();
}

backfill().catch((err) => {
  console.error('[backfill-personaRole] Fatal error:', err?.message ?? err);
  prisma.$disconnect();
  process.exit(1);
});
