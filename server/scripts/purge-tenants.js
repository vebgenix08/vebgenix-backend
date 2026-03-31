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
    console.log(`Tenants before: ${before}`);

    await prisma.$executeRawUnsafe('TRUNCATE TABLE "tenants" CASCADE;');

    const after = await prisma.tenant.count();
    console.log(`Tenants after: ${after}`);

    const [campuses, profiles, memberships, applications, enquiries] =
      await Promise.all([
        prisma.campus.count(),
        prisma.profile.count(),
        prisma.tenantMembership.count(),
        prisma.application.count(),
        prisma.enquiry.count(),
      ]);
    console.log(
      JSON.stringify(
        {
          campuses,
          profiles,
          memberships,
          applications,
          enquiries,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
