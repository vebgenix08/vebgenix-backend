const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  await prisma.passwordResetToken.deleteMany({});
  await prisma.profilePermission.deleteMany({});
  await prisma.userCampusAccess.deleteMany({});
  await prisma.userProfileLink.deleteMany({});
  await prisma.tenantMembership.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.profile.deleteMany({});
  await prisma.campus.deleteMany({});
  await prisma.tenantFeature.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.platformAuditLog.deleteMany({});
  const t = await prisma.tenant.deleteMany({});
  console.log(`✅ Done — deleted ${t.count} tenant(s) and all related data.`);
  await prisma.$disconnect();
}
main().catch(async (e) => {
  console.error(e.message);
  await prisma.$disconnect();
  process.exit(1);
});
