/**
 * Seed Platform Super Admin
 *
 * Creates or updates the platform super admin AuthUser + AuthUserGlobalRole.
 * Reads credentials from environment:
 *   PLATFORM_ADMIN_EMAIL
 *   PLATFORM_ADMIN_PASSWORD
 *
 * Usage: npx ts-node scripts/seed-platform-admin.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import bcrypt from "bcryptjs";

// Load .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Use dynamic import for Prisma to handle path resolution
const prismaModule = require("../src/infrastructure/prisma/client");
const prisma = prismaModule.default || prismaModule;

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "❌ Missing PLATFORM_ADMIN_EMAIL or PLATFORM_ADMIN_PASSWORD in .env",
    );
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log(`🔧 Seeding platform admin: ${normalizedEmail}`);

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  // Upsert AuthUser
  const user = await prisma.authUser.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      passwordHash,
      status: "ACTIVE",
    },
    update: {
      passwordHash,
      status: "ACTIVE",
    },
  });

  console.log(`✅ AuthUser created/updated: ${user.id}`);

  // Upsert AuthUserGlobalRole
  await prisma.authUserGlobalRole.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: "PLATFORM_SUPER_ADMIN",
      },
    },
    create: {
      userId: user.id,
      role: "PLATFORM_SUPER_ADMIN",
    },
    update: {},
  });

  console.log(`✅ GlobalRole PLATFORM_SUPER_ADMIN assigned`);
  console.log(`🎉 Platform admin seeded successfully!`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
