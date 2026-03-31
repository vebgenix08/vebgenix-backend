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
  const [, , emailArg] = process.argv;
  const email = String(emailArg || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/create-invite-otp.js <email>");
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.authUser.findUnique({ where: { email } });
    if (!user) throw new Error("AuthUser not found for email");

    const membership = await prisma.tenantMembership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, tenantId: true },
    });

    const code = generateCode(6);
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        purpose: "INVITE_SET_PASSWORD",
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    const row = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        membershipId: membership ? membership.id : null,
        tenantId: membership ? membership.tenantId : null,
        purpose: "INVITE_SET_PASSWORD",
        tokenHash,
        expiresAt,
        attemptCount: 0,
      },
    });

    console.log(
      JSON.stringify(
        {
          email,
          inviteCode: code,
          expiresAt: row.expiresAt,
          membershipId: row.membershipId,
          tenantId: row.tenantId,
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

