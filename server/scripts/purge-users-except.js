"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");

async function main() {
  const keepEmailArg = process.argv[2] || process.env.SUPER_ADMIN_EMAIL || "ags@vebgenix.com";
  const keepEmail = String(keepEmailArg).trim().toLowerCase();
  if (keepEmail.includes(" ")) {
    throw new Error(`Invalid keep email (contains spaces): "${keepEmailArg}"`);
  }
  const prisma = new PrismaClient();

  try {
    const keepUser = await prisma.authUser.findUnique({
      where: { email: keepEmail },
      select: { id: true, email: true },
    });

    if (!keepUser) {
      throw new Error(
        `Refusing to purge: keep user not found: ${keepEmail}. Create it first, then re-run.`,
      );
    }

    const before = await prisma.authUser.count();
    console.log(`AuthUser before: ${before}`);

    const whereNotKeepUserId = { userId: { not: keepUser.id } };
    const whereNotKeepAuthUserId = { authUserId: { not: keepUser.id } };
    const whereAuthUserNotKeep = { id: { not: keepUser.id } };

    const result = await prisma.$transaction(async (tx) => {
      const deletedGuardianLinks = await tx.guardianAuthLink.deleteMany({
        where: whereNotKeepAuthUserId,
      });
      const deletedStudentLinks = await tx.studentAuthLink.deleteMany({
        where: whereNotKeepAuthUserId,
      });
      const deletedSessions = await tx.authSession.deleteMany({
        where: whereNotKeepUserId,
      });
      const deletedResetTokens = await tx.passwordResetToken.deleteMany({
        where: whereNotKeepUserId,
      });
      const deletedProfileLinks = await tx.userProfileLink.deleteMany({
        where: whereNotKeepUserId,
      });
      const deletedGlobalRoles = await tx.authUserGlobalRole.deleteMany({
        where: whereNotKeepUserId,
      });
      const deletedMemberships = await tx.tenantMembership.deleteMany({
        where: whereNotKeepUserId,
      });
      const deletedUsers = await tx.authUser.deleteMany({
        where: whereAuthUserNotKeep,
      });

      return {
        deletedGuardianLinks: deletedGuardianLinks.count,
        deletedStudentLinks: deletedStudentLinks.count,
        deletedSessions: deletedSessions.count,
        deletedResetTokens: deletedResetTokens.count,
        deletedProfileLinks: deletedProfileLinks.count,
        deletedGlobalRoles: deletedGlobalRoles.count,
        deletedMemberships: deletedMemberships.count,
        deletedUsers: deletedUsers.count,
      };
    });

    const after = await prisma.authUser.count();
    console.log(`AuthUser after: ${after}`);
    console.log(JSON.stringify({ keep: keepUser.email, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
