"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

function generateCode(digits = 6) {
  const max = 10 ** digits;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(digits, "0");
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const stamp = Date.now();
    const email = `otp_test_${stamp}@example.com`;
    const tenantName = `OTP Test ${stamp}`;

    const tenant = await prisma.tenant.create({
      data: { name: tenantName, slug: null, isActive: true, onboardingComplete: false },
      select: { id: true, name: true },
    });

    const user = await prisma.authUser.create({
      data: { email, status: "ACTIVE" },
      select: { id: true, email: true },
    });

    const membership = await prisma.tenantMembership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: "ORG_OWNER",
        status: "INVITED",
        invitedAt: new Date(),
        campusScope: "ALL",
      },
      select: { id: true },
    });

    const code = generateCode(6);
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        membershipId: membership.id,
        tenantId: tenant.id,
        purpose: "INVITE_SET_PASSWORD",
        tokenHash,
        expiresAt,
        attemptCount: 0,
      },
      select: { id: true },
    });

    console.log(
      JSON.stringify(
        {
          email,
          tenantName: tenant.name,
          inviteCode: code,
          expiresInMinutes: 60,
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

