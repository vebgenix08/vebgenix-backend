"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");

async function main() {
  const emailArg = process.argv[2] || process.env.SUPER_ADMIN_EMAIL || "ags@vebgenix.com";
  const email = String(emailArg).trim().toLowerCase();
  if (email.includes(" ")) {
    throw new Error(`Invalid email (contains spaces): "${emailArg}"`);
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.authUser.upsert({
      where: { email },
      create: { email, status: "ACTIVE" },
      update: {},
      select: { id: true, email: true },
    });

    await prisma.authUserGlobalRole.upsert({
      where: { userId_role: { userId: user.id, role: "PLATFORM_SUPER_ADMIN" } },
      create: { userId: user.id, role: "PLATFORM_SUPER_ADMIN" },
      update: {},
      select: { id: true },
    });

    console.log(JSON.stringify({ ensured: user.email, userId: user.id }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
