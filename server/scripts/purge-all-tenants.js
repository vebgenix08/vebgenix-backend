"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");

async function main() {
  const confirm = process.env.CONFIRM_DELETE_ALL_TENANTS;
  if (confirm !== "YES") {
    throw new Error(
      'Refusing to run. Set CONFIRM_DELETE_ALL_TENANTS=YES to delete ALL tenants.',
    );
  }

  const prisma = new PrismaClient();
  try {
    const before = await prisma.tenant.count();
    console.log(`Tenant before: ${before}`);

    await prisma.$executeRaw`TRUNCATE TABLE "tenants" RESTART IDENTITY CASCADE;`;

    const after = await prisma.tenant.count();
    console.log(`Tenant after: ${after}`);
    console.log(JSON.stringify({ deletedAllTenants: true }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

