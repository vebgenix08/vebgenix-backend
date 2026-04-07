"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");

function parseCsv(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const confirm = process.env.CONFIRM_DELETE_TENANT_USERS;
  if (confirm !== "YES") {
    throw new Error(
      "Refusing to run. Set CONFIRM_DELETE_TENANT_USERS=YES to delete all tenant users.",
    );
  }

  const keepEmails = parseCsv(process.env.KEEP_USER_EMAILS);

  const prisma = new PrismaClient();
  try {
    const keepRoleRows = await prisma.authUserGlobalRole.findMany({
      where: { role: { in: ["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"] } },
      select: { userId: true, role: true },
    });
    const keepRoleUserIds = new Set(keepRoleRows.map((r) => r.userId));

    const keepEmailUsers = keepEmails.length
      ? await prisma.authUser.findMany({
          where: { email: { in: keepEmails } },
          select: { id: true, email: true },
        })
      : [];

    for (const u of keepEmailUsers) keepRoleUserIds.add(u.id);

    const keepUserIds = Array.from(keepRoleUserIds);

    const deleteUsers = await prisma.authUser.findMany({
      where: keepUserIds.length ? { id: { notIn: keepUserIds } } : {},
      select: { id: true, email: true },
    });

    console.log(
      JSON.stringify(
        {
          keepUsers: keepUserIds.length,
          deleteUsers: deleteUsers.length,
          sampleDeleteEmails: deleteUsers.slice(0, 10).map((u) => u.email),
        },
        null,
        2,
      ),
    );

    if (deleteUsers.length === 0) return;

    const ids = deleteUsers.map((u) => u.id);

    await prisma.$transaction([
      prisma.authSession.deleteMany({ where: { userId: { in: ids } } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userProfileLink.deleteMany({ where: { userId: { in: ids } } }),
      prisma.tenantMembership.deleteMany({ where: { userId: { in: ids } } }),
      prisma.studentAuthLink.deleteMany({ where: { authUserId: { in: ids } } }),
      prisma.guardianAuthLink.deleteMany({ where: { authUserId: { in: ids } } }),
      prisma.authUserGlobalRole.deleteMany({ where: { userId: { in: ids } } }),
      prisma.authUser.deleteMany({ where: { id: { in: ids } } }),
    ]);

    const after = await prisma.authUser.count();
    console.log(JSON.stringify({ ok: true, remainingAuthUsers: after }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

