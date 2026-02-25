/**
 * Phase 4 — Seed minimum Permission records
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING
 *
 * Usage:
 *   cd server
 *   npx ts-node --project tsconfig.json scripts/seed-permissions.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS: Array<{ key: string; label: string; module: string }> = [
  // Dashboard
  { key: 'dashboard.view',             label: 'View Dashboard',               module: 'dashboard' },
  { key: 'dashboard.view.finance',     label: 'View Finance Dashboard',       module: 'dashboard' },
  { key: 'dashboard.view.admissions',  label: 'View Admissions Dashboard',    module: 'dashboard' },

  // Users
  { key: 'users.view',                 label: 'View Users',                   module: 'users' },
  { key: 'users.invite',               label: 'Invite Users',                 module: 'users' },
  { key: 'users.edit',                 label: 'Edit Users',                   module: 'users' },
  { key: 'users.deactivate',           label: 'Deactivate Users',             module: 'users' },
  { key: 'users.assign_permissions',   label: 'Assign Permissions to Users',  module: 'users' },

  // Admissions
  { key: 'admissions.enquiry.view',      label: 'View Enquiries',             module: 'admissions' },
  { key: 'admissions.enquiry.create',    label: 'Create Enquiries',           module: 'admissions' },
  { key: 'admissions.enquiry.edit',      label: 'Edit Enquiries',             module: 'admissions' },
  { key: 'admissions.application.view',  label: 'View Applications',          module: 'admissions' },
  { key: 'admissions.application.edit',  label: 'Edit Applications',          module: 'admissions' },
  { key: 'admissions.stage.transition',  label: 'Transition Application Stage', module: 'admissions' },
  { key: 'admissions.enroll',            label: 'Enroll Students',            module: 'admissions' },
];

async function seed() {
  console.log('[seed-permissions] Starting...');

  let inserted = 0;

  for (const perm of PERMISSIONS) {
    const result = await prisma.$executeRawUnsafe(
      `INSERT INTO public.permissions (id, key, label, module, created_at, updated_at)
       VALUES (gen_random_uuid()::TEXT, $1, $2, $3, NOW(), NOW())
       ON CONFLICT (key) DO NOTHING`,
      perm.key,
      perm.label,
      perm.module,
    );
    inserted += result; // result = number of rows inserted (0 or 1)
  }

  console.log(`[seed-permissions] Done: ${inserted} new permission(s) inserted (${PERMISSIONS.length - inserted} already existed).`);
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('[seed-permissions] Fatal error:', err);
  prisma.$disconnect();
  process.exit(1);
});
