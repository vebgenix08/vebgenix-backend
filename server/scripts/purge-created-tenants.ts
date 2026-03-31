import { getPrisma, runWithTenantContext } from "../src/infrastructure/prisma/client";

const CONFIRM = process.env.CONFIRM_DELETE_CREATED_TENANTS === "YES";

const TENANT_NAME_PREFIXES = [
  "sec-test-a-",
  "sec-test-b-",
  "rls-a-",
  "rls-b-",
  "rls-eff-a-",
  "rls-eff-b-",
  "dbg-tenant-",
];

const AUTH_USER_EMAIL_PREFIXES = [
  "sec-user-a-",
  "sec-user-b-",
  "sec-user-c-",
  "rls-user-a-",
  "rls-user-b-",
  "rls-eff-user-a-",
  "rls-eff-user-b-",
  "dbg-user-",
];

const SAFE_IDENT = /^[A-Za-z0-9_]+$/;

function likeAny(field: string, prefixes: string[], suffix?: string) {
  const parts: string[] = [];
  for (const p of prefixes) {
    const pat = `${p}%${suffix ?? ""}`.replace(/'/g, "''");
    parts.push(`${field} LIKE '${pat}'`);
  }
  return `(${parts.join(" OR ")})`;
}

function isFkViolation(e: any) {
  return e?.code === "23503" || String(e?.message ?? "").includes("violates foreign key constraint");
}

async function deleteTenantScopedRows(tenantId: string) {
  const prisma = await getPrisma();

  await runWithTenantContext(tenantId, "00000000-0000-0000-0000-000000000000", async (db) => {
    const rows = (await db.$queryRawUnsafe(
      "select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('tenant_id','tenantId')",
    )) as Array<{ table_name: string; column_name: string }>;

    const targets = rows
      .filter((r) => SAFE_IDENT.test(r.table_name) && SAFE_IDENT.test(r.column_name))
      .filter((r) => r.table_name !== "tenants");

    const remaining = new Map<string, string>();
    for (const t of targets) remaining.set(t.table_name, t.column_name);

    for (let pass = 0; pass < 12; pass++) {
      let progressed = false;

      for (const [table, col] of Array.from(remaining.entries())) {
        const sp = `sp_${pass}_${table}`;
        const sql = `delete from "public"."${table}" where "${col}" = '${tenantId}'::uuid`;
        try {
          await db.$executeRawUnsafe(`SAVEPOINT ${sp}`);
          await db.$executeRawUnsafe(sql);
          await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`);
          remaining.delete(table);
          progressed = true;
        } catch (e: any) {
          try {
            await db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`);
            await db.$executeRawUnsafe(`RELEASE SAVEPOINT ${sp}`);
          } catch (_) {
          }
          if (isFkViolation(e)) continue;
          throw e;
        }
      }

      if (!progressed) break;
      if (remaining.size === 0) break;
    }

    if (remaining.size > 0) {
      const leftover = Array.from(remaining.keys()).sort();
      throw new Error(`Unable to delete all tenant-scoped rows for ${tenantId}. Remaining tables: ${leftover.join(", ")}`);
    }
  });

  await prisma.tenant.delete({ where: { id: tenantId } });
}

async function main() {
  if (!CONFIRM) {
    throw new Error('Refusing to run. Set CONFIRM_DELETE_CREATED_TENANTS=YES to proceed.');
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production.");
  }

  const prisma = await getPrisma();

  const tenantWhere = likeAny("name", TENANT_NAME_PREFIXES);
  const tenants = (await prisma.$queryRawUnsafe(
    `select id, name, created_at as "createdAt" from tenants where ${tenantWhere} order by created_at desc`,
  )) as Array<{ id: string; name: string; createdAt: Date }>;

  const emailWhere = `${likeAny("email", AUTH_USER_EMAIL_PREFIXES, "@example.test")} AND email LIKE '%@example.test'`;
  const authUsers = (await prisma.$queryRawUnsafe(
    `select id, email from "AuthUser" where ${emailWhere} order by "createdAt" desc`,
  )) as Array<{ id: string; email: string }>;

  console.log(
    JSON.stringify(
      {
        willDeleteTenants: tenants.map((t) => ({ id: t.id, name: t.name })),
        willDeleteAuthUsers: authUsers.map((u) => ({ id: u.id, email: u.email })),
      },
      null,
      2,
    ),
  );

  for (const t of tenants) {
    await deleteTenantScopedRows(t.id);
  }

  if (authUsers.length > 0) {
    const ids = authUsers.map((u) => `'${u.id}'::uuid`).join(",");
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`delete from "AuthSession" where "userId" in (${ids})`),
      prisma.$executeRawUnsafe(`delete from "AuthUserGlobalRole" where "userId" in (${ids})`),
      prisma.$executeRawUnsafe(`delete from "AuthUser" where id in (${ids})`),
    ]);
  }

  const remainingTenants = (await prisma.$queryRawUnsafe(
    `select count(*)::int as c from tenants where ${tenantWhere}`,
  )) as any[];
  console.log(JSON.stringify({ deletedTenants: tenants.length, deletedAuthUsers: authUsers.length, remainingMatchingTenants: remainingTenants[0]?.c ?? 0 }, null, 2));
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
