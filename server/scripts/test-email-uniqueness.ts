/**
 * Test: Email Uniqueness in Tenant Creation / Primary Admin Invite Flow
 *
 * Run with: npx ts-node --project tsconfig.json scripts/test-email-uniqueness.ts
 *
 * Guard: requires ALLOW_EMAIL_UNIQUE_TESTS=true and non-production NODE_ENV.
 * All data created is cleaned up in the `finally` block.
 */

import { PlatformService } from "../src/services/PlatformService";
import prisma from "../src/infrastructure/prisma/client";
import { v4 as uuidv4 } from "uuid";

// ─── Test harness ─────────────────────────────────────────────────────────────

type TestCase = { name: string; run: () => Promise<void> };

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function assertRejectedWith(
  fn: () => Promise<any>,
  expectedCode: string,
  message: string,
): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected rejection with code "${expectedCode}" but resolved. ${message}`);
  } catch (e: any) {
    if (e.code === expectedCode) return; // ✓ expected
    throw new Error(
      `Expected error.code="${expectedCode}" but got code="${e.code ?? "none"}", message="${e.message}". Context: ${message}`,
    );
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

const runId = uuidv4().slice(0, 8);
const BASE_EMAIL = `primary-admin-${runId}@example.test`;

// Platform super-admin placeholder (needed as actorId)
let platformUserId: string;

// Tenants created during the test (for cleanup)
const tenantIds: string[] = [];
// Extra authUsers created outside PlatformService (for cleanup)
const extraUserIds: string[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTenant(name: string): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: { name: `email-unique-test-${name}-${runId}`, isActive: true, onboardingComplete: false },
  });
  tenantIds.push(tenant.id);
  return tenant.id;
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    name: "1. Same email (exact match) blocked on second tenant",
    run: async () => {
      const t1 = await makeTenant("exact-t1");
      const t2 = await makeTenant("exact-t2");

      // First tenant → must succeed
      await PlatformService.createFirstAdmin(t1, BASE_EMAIL, "Admin One", platformUserId, false);

      // Second tenant with SAME email → must fail with correct code
      await assertRejectedWith(
        () => PlatformService.createFirstAdmin(t2, BASE_EMAIL, "Admin One Again", platformUserId, false),
        "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS",
        "Same email on second tenant should be blocked",
      );
    },
  },
  {
    name: "2. Same email with different case blocked (e.g. UPPER, Mixed)",
    run: async () => {
      const t1 = await makeTenant("case-t1");
      const t2 = await makeTenant("case-t2");
      const t3 = await makeTenant("case-t3");

      const baseEmail = `case-test-${runId}@example.test`;

      await PlatformService.createFirstAdmin(t1, baseEmail, "Admin", platformUserId, false);

      // UPPERCASE variant
      await assertRejectedWith(
        () =>
          PlatformService.createFirstAdmin(
            t2,
            baseEmail.toUpperCase(),
            "Admin Upper",
            platformUserId,
            false,
          ),
        "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS",
        "UPPERCASE email should be blocked (case-insensitive check)",
      );

      // Mixed case variant
      const mixed = baseEmail[0].toUpperCase() + baseEmail.slice(1);
      await assertRejectedWith(
        () => PlatformService.createFirstAdmin(t3, mixed, "Admin Mixed", platformUserId, false),
        "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS",
        "Mixed-case email should be blocked (case-insensitive check)",
      );
    },
  },
  {
    name: "3. Same email with leading/trailing whitespace blocked",
    run: async () => {
      const t1 = await makeTenant("ws-t1");
      const t2 = await makeTenant("ws-t2");
      const t3 = await makeTenant("ws-t3");

      const wsEmail = `whitespace-${runId}@example.test`;

      await PlatformService.createFirstAdmin(t1, wsEmail, "Admin", platformUserId, false);

      // Leading spaces
      await assertRejectedWith(
        () =>
          PlatformService.createFirstAdmin(
            t2,
            `   ${wsEmail}`,
            "Admin Spaced Left",
            platformUserId,
            false,
          ),
        "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS",
        "Email with leading spaces should be blocked",
      );

      // Trailing spaces
      await assertRejectedWith(
        () =>
          PlatformService.createFirstAdmin(
            t3,
            `${wsEmail}   `,
            "Admin Spaced Right",
            platformUserId,
            false,
          ),
        "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS",
        "Email with trailing spaces should be blocked",
      );
    },
  },
  {
    name: "4. Repeated tenant creation with same primary admin email blocked end-to-end",
    run: async () => {
      const adminsEmail = `repeated-admin-${runId}@example.test`;

      // Create 3 tenants and try to use same email for all
      for (let i = 0; i < 3; i++) {
        const t = await makeTenant(`repeated-t${i}`);
        if (i === 0) {
          // First time must succeed
          const result = await PlatformService.createFirstAdmin(
            t,
            adminsEmail,
            "Repeated Admin",
            platformUserId,
            false,
          );
          assert(result.userId, "Expected userId in result");
        } else {
          // All subsequent times must fail
          await assertRejectedWith(
            () =>
              PlatformService.createFirstAdmin(t, adminsEmail, "Repeated Admin", platformUserId, false),
            "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS",
            `Tenant #${i + 1}: same primary admin email must be blocked`,
          );
        }
      }
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.ALLOW_EMAIL_UNIQUE_TESTS !== "true") {
    throw new Error("Set ALLOW_EMAIL_UNIQUE_TESTS=true to run these tests.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production.");
  }

  // Create a throw-away platform user as actorId
  const platformUser = await prisma.authUser.create({
    data: { email: `platform-actor-${runId}@example.test`, status: "ACTIVE" },
  });
  extraUserIds.push(platformUser.id);
  platformUserId = platformUser.id;

  const results: { name: string; ok: boolean; error?: string }[] = [];

  try {
    for (const t of tests) {
      try {
        await t.run();
        results.push({ name: t.name, ok: true });
        console.log(`  ✓  ${t.name}`);
      } catch (e: any) {
        results.push({ name: t.name, ok: false, error: e?.message ?? String(e) });
        console.error(`  ✗  ${t.name}\n     ${e?.message ?? e}`);
      }
    }
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    try {
      // Delete memberships and profiles tied to test tenants
      await prisma.passwordResetToken.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.tenantMembership.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.profile.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.tenantFeature.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: tenantIds } },
      });
      // Clean up any AuthUsers created via createFirstAdmin (email used in tests)
      const testEmails = [
        BASE_EMAIL,
        `case-test-${runId}@example.test`,
        `whitespace-${runId}@example.test`,
        `repeated-admin-${runId}@example.test`,
      ].map((e) => e.toLowerCase().trim());
      await prisma.authUser.deleteMany({
        where: { email: { in: testEmails } },
      });
      // Clean up platform actor user
      await prisma.authUser.deleteMany({
        where: { id: { in: extraUserIds } },
      });
    } catch (cleanupErr: any) {
      console.warn("[cleanup] Warning:", cleanupErr?.message ?? cleanupErr);
    }
  }

  const failed = results.filter((r) => !r.ok);
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: failed.length,
  };

  console.log("\n──────────────────────────────────────────");
  console.log(JSON.stringify({ ...summary, ...(failed.length ? { failed } : {}) }, null, 2));

  if (failed.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message ?? String(e));
  process.exit(1);
});
