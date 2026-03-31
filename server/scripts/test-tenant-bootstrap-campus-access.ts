import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import prisma from "../src/infrastructure/prisma/client";
import { PlatformService } from "../src/services/PlatformService";
import { app } from "../src/main";
import type { Server } from "http";

type TestCase = { name: string; run: () => Promise<void> };

function assert(condition: any, message: string) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function startServer(): Promise<{ baseUrl: string; server: Server }> {
  return await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      resolve({ baseUrl: `http://127.0.0.1:${addr.port}`, server });
    });
  });
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

async function httpJson(
  baseUrl: string,
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const runId = uuidv4().slice(0, 8);
const tenantIds: string[] = [];
const userIds: string[] = [];

async function makePlatformActor(): Promise<string> {
  const actor = await prisma.authUser.create({
    data: { email: `platform-actor-${runId}@example.test`, status: "ACTIVE" },
  });
  userIds.push(actor.id);
  return actor.id;
}

async function setPassword(userId: string, password: string): Promise<void> {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  await prisma.authUser.update({
    where: { id: userId },
    data: { passwordHash, updatedAt: new Date() },
  });
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const { status, json } = await httpJson(baseUrl, "POST", "/api/auth/login", {
    email,
    password,
  });
  assert(status === 200, `Expected 200 login, got ${status}: ${JSON.stringify(json)}`);
  assert(json?.access_token, "Expected access_token in login response");
  return json.access_token as string;
}

async function tenantMe(baseUrl: string, token: string) {
  const { status, json } = await httpJson(baseUrl, "GET", "/api/tenant/me", undefined, token);
  assert(status === 200, `Expected 200 tenant/me, got ${status}: ${JSON.stringify(json)}`);
  return json;
}

const tests: TestCase[] = [
  {
    name: "1. Tenant created with one campus -> Primary Admin sees it after login",
    run: async () => {
      const actorId = await makePlatformActor();
      const tenant = await PlatformService.createTenant(
        `bootstrap-one-campus-${runId}`,
        `bootstrap-one-campus-${runId}`,
        actorId,
      );
      tenantIds.push(tenant.id);

      const campus = await PlatformService.createCampus(tenant.id, "Campus A", "SCHOOL", actorId);

      const adminEmail = `primary-one-${runId}@example.test`;
      const adminPassword = `Passw0rd!${runId}`;
      const admin = await PlatformService.createFirstAdmin(
        tenant.id,
        adminEmail,
        "Primary Admin",
        actorId,
        false,
      );
      userIds.push(admin.userId);
      await setPassword(admin.userId, adminPassword);

      const { baseUrl, server } = await startServer();
      try {
        const token = await login(baseUrl, adminEmail, adminPassword);
        const me = await tenantMe(baseUrl, token);

        const campuses = me?.campuses ?? [];
        assert(Array.isArray(campuses), "Expected campuses array");
        assert(campuses.length === 1, `Expected 1 campus, got ${campuses.length}`);
        assert(campuses[0]?.id === campus.id, "Expected returned campus to match created campus");
      } finally {
        await stopServer(server);
      }
    },
  },
  {
    name: "2. Tenant created with multiple campuses -> Primary Admin sees all",
    run: async () => {
      const actorId = await makePlatformActor();
      const tenant = await PlatformService.createTenant(
        `bootstrap-multi-campus-${runId}`,
        `bootstrap-multi-campus-${runId}`,
        actorId,
      );
      tenantIds.push(tenant.id);

      const c1 = await PlatformService.createCampus(tenant.id, "Campus A", "SCHOOL", actorId);
      const c2 = await PlatformService.createCampus(tenant.id, "Campus B", "PU", actorId);
      const c3 = await PlatformService.createCampus(tenant.id, "Campus C", "SCHOOL", actorId);
      const createdIds = new Set([c1.id, c2.id, c3.id]);

      const adminEmail = `primary-multi-${runId}@example.test`;
      const adminPassword = `Passw0rd!${runId}`;
      const admin = await PlatformService.createFirstAdmin(
        tenant.id,
        adminEmail,
        "Primary Admin",
        actorId,
        false,
      );
      userIds.push(admin.userId);
      await setPassword(admin.userId, adminPassword);

      const { baseUrl, server } = await startServer();
      try {
        const token = await login(baseUrl, adminEmail, adminPassword);
        const me = await tenantMe(baseUrl, token);
        const campuses = me?.campuses ?? [];
        assert(campuses.length === 3, `Expected 3 campuses, got ${campuses.length}`);
        for (const c of campuses) {
          assert(createdIds.has(c.id), `Unexpected campus id: ${c.id}`);
        }
      } finally {
        await stopServer(server);
      }
    },
  },
  {
    name: "3. Primary Admin with ALL campuses does not require mapping rows",
    run: async () => {
      const actorId = await makePlatformActor();
      const tenant = await PlatformService.createTenant(
        `bootstrap-no-mappings-${runId}`,
        `bootstrap-no-mappings-${runId}`,
        actorId,
      );
      tenantIds.push(tenant.id);

      await PlatformService.createCampus(tenant.id, "Campus A", "SCHOOL", actorId);

      const adminEmail = `primary-nomap-${runId}@example.test`;
      const admin = await PlatformService.createFirstAdmin(
        tenant.id,
        adminEmail,
        "Primary Admin",
        actorId,
        false,
      );
      userIds.push(admin.userId);

      const mappingCount = await prisma.userCampusAccess.count({
        where: { tenantId: tenant.id, profileId: admin.userId },
      });
      assert(mappingCount === 0, `Expected 0 mapping rows, got ${mappingCount}`);

      const membership = await prisma.tenantMembership.findFirst({
        where: { tenantId: tenant.id, userId: admin.userId, isPrimaryAdmin: true },
        select: { primaryProfileId: true },
      });
      assert(
        membership?.primaryProfileId === admin.userId,
        "Expected primaryProfileId set on primary admin membership",
      );
    },
  },
  {
    name: "4. User with selected campuses requires and uses mapping rows",
    run: async () => {
      const actorId = await makePlatformActor();
      const tenant = await PlatformService.createTenant(
        `bootstrap-selected-${runId}`,
        `bootstrap-selected-${runId}`,
        actorId,
      );
      tenantIds.push(tenant.id);

      const c1 = await PlatformService.createCampus(tenant.id, "Campus A", "SCHOOL", actorId);
      const c2 = await PlatformService.createCampus(tenant.id, "Campus B", "PU", actorId);
      const c3 = await PlatformService.createCampus(tenant.id, "Campus C", "SCHOOL", actorId);

      const staffEmail = `staff-selected-${runId}@example.test`;
      const staffPassword = `Passw0rd!${runId}`;
      const staffUser = await prisma.authUser.create({
        data: { email: staffEmail, status: "ACTIVE" },
      });
      userIds.push(staffUser.id);
      await setPassword(staffUser.id, staffPassword);

      await prisma.profile.create({
        data: {
          id: staffUser.id,
          tenantId: tenant.id,
          email: staffEmail,
          fullName: "Staff User",
          role: "STAFF",
          campusScope: "ALL",
          allCampusesAccess: false,
          isActive: true,
        },
      });

      await prisma.tenantMembership.create({
        data: {
          userId: staffUser.id,
          tenantId: tenant.id,
          role: "STAFF",
          status: "ACTIVE",
          primaryProfileId: staffUser.id,
        },
      });

      await prisma.userCampusAccess.createMany({
        data: [
          { tenantId: tenant.id, profileId: staffUser.id, campusId: c1.id },
          { tenantId: tenant.id, profileId: staffUser.id, campusId: c3.id },
        ],
        skipDuplicates: true,
      });

      const mappingCount = await prisma.userCampusAccess.count({
        where: { tenantId: tenant.id, profileId: staffUser.id },
      });
      assert(mappingCount === 2, `Expected 2 mapping rows, got ${mappingCount}`);

      const { baseUrl, server } = await startServer();
      try {
        const token = await login(baseUrl, staffEmail, staffPassword);
        const me = await tenantMe(baseUrl, token);
        const campuses = me?.campuses ?? [];
        const ids = new Set((campuses || []).map((c: any) => c.id));
        assert(ids.has(c1.id), "Expected staff campus list to include mapped campus A");
        assert(ids.has(c3.id), "Expected staff campus list to include mapped campus C");
        assert(!ids.has(c2.id), "Expected staff campus list to exclude unmapped campus B");
      } finally {
        await stopServer(server);
      }
    },
  },
];

async function cleanup() {
  try {
    if (tenantIds.length) {
      await prisma.userCampusAccess.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.profilePermission.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.profile.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.campus.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenantFeature.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }

    if (userIds.length) {
      await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authUserGlobalRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.authUser.deleteMany({ where: { id: { in: userIds } } });
    }
  } catch (e) {
    console.error("[bootstrap-tests] Cleanup failed:", e);
  }
}

async function main() {
  if (process.env.ALLOW_BOOTSTRAP_TESTS !== "true") {
    throw new Error("Set ALLOW_BOOTSTRAP_TESTS=true to run these tests.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production.");
  }

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
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    throw new Error(`Bootstrap campus access tests failed (${failed.length}/${results.length}).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
