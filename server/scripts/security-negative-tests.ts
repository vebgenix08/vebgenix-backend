import { v4 as uuidv4 } from "uuid";
import { getPrisma, runWithTenantContext } from "../src/infrastructure/prisma/client";
import { StudentService } from "../src/domain/students/student-service";
import { IdentityService } from "../src/domain/identity/services";
import { FinanceService } from "../src/domain/finance/finance-service";
import { AuthorizationError } from "../src/domain/shared/errors";
import { AuthContext } from "../src/domain/identity/entities";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

function assert(condition: any, message: string) {
  if (!condition) throw new Error(message);
}

async function assertRejects(fn: () => Promise<any>, predicate: (e: any) => boolean, message: string) {
  try {
    await fn();
    throw new Error(message);
  } catch (e: any) {
    if (!predicate(e)) {
      throw new Error(`${message}. Got: ${e?.message ?? String(e)}`);
    }
  }
}

function prismaNotFound(e: any) {
  return e?.code === "P2025" || String(e?.message ?? "").includes("Record to update not found");
}

async function ensureRlsPresent() {
  const prisma = await getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `select polname from pg_policy where polname = 'tenant_isolation' limit 1`,
  )) as any[];
  assert(rows.length === 1, "RLS policy 'tenant_isolation' not found. Apply rls-migration.sql first.");
}

async function main() {
  if (process.env.ALLOW_SECURITY_TESTS !== "true") {
    throw new Error("Set ALLOW_SECURITY_TESTS=true to run security negative tests.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production.");
  }

  if (process.env.SECURITY_TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.SECURITY_TEST_DATABASE_URL;
    process.env.DIRECT_URL = process.env.SECURITY_TEST_DATABASE_URL;
  }

  await ensureRlsPresent();

  const prisma = await getPrisma();
  const runId = uuidv4().slice(0, 8);

  const tenantA = await prisma.tenant.create({ data: { name: `sec-test-a-${runId}` } });
  const tenantB = await prisma.tenant.create({ data: { name: `sec-test-b-${runId}` } });

  const userA = await prisma.authUser.create({ data: { email: `sec-user-a-${runId}@example.test`, status: "ACTIVE" } });
  const userB = await prisma.authUser.create({ data: { email: `sec-user-b-${runId}@example.test`, status: "ACTIVE" } });
  const userC = await prisma.authUser.create({ data: { email: `sec-user-c-${runId}@example.test`, status: "ACTIVE" } });

  const membershipA = await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.tenantMembership.create({
      data: {
        tenantId: tenantA.id,
        userId: userA.id,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  );

  const campusA1 = await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.campus.create({
      data: { tenantId: tenantA.id, name: `campus-a1-${runId}`, campusType: "SCHOOL", isActive: true },
    }),
  );
  const campusA2 = await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.campus.create({
      data: { tenantId: tenantA.id, name: `campus-a2-${runId}`, campusType: "SCHOOL", isActive: true },
    }),
  );

  const campusB1 = await runWithTenantContext(tenantB.id, userB.id, (db) =>
    db.campus.create({
      data: { tenantId: tenantB.id, name: `campus-b1-${runId}`, campusType: "SCHOOL", isActive: true },
    }),
  );

  const applicationA = await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.application.create({
      data: {
        tenantId: tenantA.id,
        fullName: "Student A",
        dob: new Date("2010-01-01"),
        phone: `99999${runId.slice(0, 3)}01`,
        gradeApplyingFor: "Grade 1",
        academicYear: "2025-26",
        campusScope: "SCHOOL",
        campusId: campusA2.id,
        status: "SUBMITTED",
      },
    }),
  );

  const studentA = await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.student.create({
      data: {
        tenantId: tenantA.id,
        applicationId: applicationA.id,
        registrationNumber: `REG-${runId}-A`,
        fullName: "Student A",
        currentGrade: "Grade 1",
        campusType: "SCHOOL",
        campusId: campusA2.id,
      },
    }),
  );

  await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.studentAuthLink.create({
      data: {
        tenantId: tenantA.id,
        studentId: studentA.id,
        authUserId: userA.id,
      },
    }),
  );

  const guardianA = await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.guardian.create({
      data: {
        tenantId: tenantA.id,
        fullName: "Guardian A",
        email: `guardian-a-${runId}@example.test`,
        phone: `88888${runId.slice(0, 3)}01`,
        relationship: "FATHER",
      },
    }),
  );

  await runWithTenantContext(tenantA.id, userA.id, (db) =>
    db.guardianAuthLink.create({
      data: { tenantId: tenantA.id, guardianId: guardianA.id, authUserId: userA.id },
    }),
  );

  const tests: TestCase[] = [
    {
      name: "cross-tenant read denied (Student)",
      run: async () => {
        const student = await runWithTenantContext(tenantB.id, userB.id, (db) =>
          db.student.findUnique({ where: { id: studentA.id }, select: { id: true } }),
        );
        assert(student === null, "Expected student to be invisible across tenants");
      },
    },
    {
      name: "cross-tenant mutation denied (Student update)",
      run: async () => {
        await assertRejects(
          () =>
            runWithTenantContext(tenantB.id, userB.id, (db) =>
              db.student.update({ where: { id: studentA.id }, data: { fullName: "HACK" } }),
            ),
          prismaNotFound,
          "Expected update to fail across tenants",
        );
      },
    },
    {
      name: "missing tenant context yields no tenant rows (Campus)",
      run: async () => {
        const campuses = await prisma.campus.findMany({ where: { id: { in: [campusA1.id, campusB1.id] } } });
        assert(campuses.length === 0, "Expected RLS to hide tenant rows when app.tenant_id is not set");
      },
    },
    {
      name: "wrong campus scope hides students",
      run: async () => {
        const ctx: AuthContext = {
          user: { id: userA.id, email: userA.email, fullName: "User A", isPlatformAdmin: false },
          membership: {
            id: membershipA.id,
            tenantId: tenantA.id,
            userId: userA.id,
            status: "ACTIVE" as any,
            roles: [],
            campusScope: new Set([campusA1.id]),
            isAllCampuses: false,
            isPrimaryOwner: false,
          },
          permissions: new Set(["students.view"]),
          allowedCampusIds: new Set([campusA1.id]),
          hasAllCampusesAccess: false,
        };
        const items = await runWithTenantContext(tenantA.id, userA.id, (db) => StudentService.listStudents(db, ctx));
        assert(items.length === 0, "Expected students outside allowed campus scope to be hidden");
      },
    },
    {
      name: "disabled membership blocks context resolution",
      run: async () => {
        await runWithTenantContext(tenantB.id, userB.id, (db) =>
          db.tenantMembership.create({
            data: { tenantId: tenantB.id, userId: userB.id, status: "DISABLED" },
          }),
        );
        await assertRejects(
          () => IdentityService.getContext(userB.id, tenantB.id),
          (e) => e instanceof AuthorizationError,
          "Expected disabled membership to block auth context",
        );
      },
    },
    {
      name: "missing permission blocks tenant mutation (Finance)",
      run: async () => {
        const ctx: AuthContext = {
          user: { id: userA.id, email: userA.email, fullName: "User A", isPlatformAdmin: false },
          membership: {
            id: membershipA.id,
            tenantId: tenantA.id,
            userId: userA.id,
            status: "ACTIVE" as any,
            roles: [],
            campusScope: new Set(),
            isAllCampuses: true,
            isPrimaryOwner: false,
          },
          permissions: new Set(),
          allowedCampusIds: new Set(),
          hasAllCampusesAccess: true,
        };
        await assertRejects(
          () => runWithTenantContext(tenantA.id, userA.id, (db) => FinanceService.createFeeHead(db, ctx, "X", "ONE_TIME")),
          (e) => e instanceof AuthorizationError,
          "Expected missing permission to block finance.manage",
        );
      },
    },
    {
      name: "portal link not visible across tenants (StudentAuthLink)",
      run: async () => {
        const link = await runWithTenantContext(tenantB.id, userB.id, (db) =>
          db.studentAuthLink.findUnique({ where: { authUserId: userA.id }, select: { id: true } }),
        );
        assert(link === null, "Expected student auth link to be invisible across tenants");
      },
    },
    {
      name: "portal link required (StudentAuthLink missing)",
      run: async () => {
        const link = await runWithTenantContext(tenantA.id, userA.id, (db) =>
          db.studentAuthLink.findUnique({ where: { authUserId: userC.id }, select: { id: true } }),
        );
        assert(link === null, "Expected missing student auth link");
      },
    },
    {
      name: "portal link not visible across tenants (GuardianAuthLink)",
      run: async () => {
        const link = await runWithTenantContext(tenantB.id, userB.id, (db) =>
          db.guardianAuthLink.findUnique({ where: { authUserId: userA.id }, select: { id: true } }),
        );
        assert(link === null, "Expected guardian auth link to be invisible across tenants");
      },
    },
  ];

  const results: { name: string; ok: boolean; error?: string }[] = [];
  try {
    for (const t of tests) {
      try {
        await t.run();
        results.push({ name: t.name, ok: true });
      } catch (e: any) {
        results.push({ name: t.name, ok: false, error: e?.message ?? String(e) });
      }
    }
  } finally {
    try {
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.guardianAuthLink.deleteMany({ where: { tenantId: tenantA.id } }));
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.studentAuthLink.deleteMany({ where: { tenantId: tenantA.id } }));
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.student.deleteMany({ where: { tenantId: tenantA.id } }));
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.application.deleteMany({ where: { tenantId: tenantA.id } }));
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.guardian.deleteMany({ where: { tenantId: tenantA.id } }));
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.campus.deleteMany({ where: { tenantId: tenantA.id } }));
      await runWithTenantContext(tenantA.id, userA.id, (db) => db.tenantMembership.deleteMany({ where: { tenantId: tenantA.id, userId: userA.id } }));
      await runWithTenantContext(tenantB.id, userB.id, (db) => db.campus.deleteMany({ where: { tenantId: tenantB.id } }));
      await runWithTenantContext(tenantB.id, userB.id, (db) => db.tenantMembership.deleteMany({ where: { tenantId: tenantB.id, userId: userB.id } }));
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
      await prisma.authUser.deleteMany({ where: { id: { in: [userA.id, userB.id, userC.id] } } });
    } catch {}
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(JSON.stringify({ ok: false, failed }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, count: results.length }, null, 2));
}

main().catch((e) => {
  const message = e?.message ?? String(e);
  console.error(message);
  if (
    message.includes("Can't reach database server") ||
    message.includes("ECONNREFUSED") ||
    message.includes("connect ECONNREFUSED")
  ) {
    console.error(
      "Database not reachable at 127.0.0.1:5432. If you use the AWS SSM tunnel, run it in a separate terminal and keep it running:\n" +
        "powershell -ExecutionPolicy Bypass -File server\\scripts\\start-tunnel.ps1",
    );
  }
  process.exit(1);
});
