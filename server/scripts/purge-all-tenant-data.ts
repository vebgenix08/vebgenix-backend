/**
 * Purge ALL tenants and tenant-scoped users from the database.
 * Keeps platform super-admin AuthUsers untouched.
 *
 * Run: npx ts-node --project tsconfig.json scripts/purge-all-tenant-data.ts
 * Requires: CONFIRM_PURGE_ALL=YES
 */

import { getPrisma } from "../src/infrastructure/prisma/client";

async function main() {
  if (process.env.CONFIRM_PURGE_ALL !== "YES") {
    throw new Error("Set CONFIRM_PURGE_ALL=YES to confirm deletion.");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run in production.");
  }

  const prisma = await getPrisma();

  // 1. List what will be deleted
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`Found ${tenants.length} tenant(s) to delete:`);
  for (const t of tenants) console.log(`  - ${t.name} (${t.id})`);

  if (tenants.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const tenantIds = tenants.map((t) => t.id);

  // 2. Get all membership-linked AuthUser IDs (tenant users, NOT platform admins)
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { userId: true },
  });
  const tenantUserIds = [...new Set(memberships.map((m) => m.userId))];

  // 3. Find which of those are platform super admins (keep those AuthUsers)
  const platformAdminUserIds = new Set<string>();
  if (tenantUserIds.length > 0) {
    const platformRoles = await prisma.authUserGlobalRole.findMany({
      where: { userId: { in: tenantUserIds }, role: "PLATFORM_SUPER_ADMIN" },
      select: { userId: true },
    });
    for (const r of platformRoles) platformAdminUserIds.add(r.userId);
  }

  const usersToDelete = tenantUserIds.filter((id) => !platformAdminUserIds.has(id));
  console.log(`\nWill delete ${usersToDelete.length} tenant AuthUser(s) (keeping ${platformAdminUserIds.size} platform admin(s)).`);

  // 4. Delete in dependency order
  // Password reset tokens
  await prisma.passwordResetToken.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ PasswordResetTokens deleted");

  // Member roles
  await prisma.memberRole.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ MemberRoles deleted");

  // Role permissions + definitions
  await prisma.rolePermission.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.roleDefinition.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ RolePermissions & RoleDefinitions deleted");

  // Tenant memberships
  await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ TenantMemberships deleted");

  // Profile permissions
  await prisma.profilePermission.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ ProfilePermissions deleted");

  // User profile links for tenant users
  if (usersToDelete.length > 0) {
    await prisma.userProfileLink.deleteMany({ where: { userId: { in: usersToDelete } } });
  }
  console.log("  ✓ UserProfileLinks deleted");

  // User campus access
  await prisma.userCampusAccess.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ UserCampusAccess deleted");

  // Students: auth links, guardians, fee assignments
  await prisma.studentAuthLink.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.guardianAuthLink.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.studentGuardian.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.studentFeeAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Student links & fee assignments deleted");

  // Application reviews, documents
  await prisma.applicationReview.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.applicationDocument.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Application reviews & documents deleted");

  // Admission offers (if any)
  try { await prisma.admissionOffer.deleteMany({ where: { tenantId: { in: tenantIds } } }); } catch {}
  
  // Students
  await prisma.student.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Students deleted");

  // Applications
  await prisma.application.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Applications deleted");

  // Applicants
  try { await prisma.applicant.deleteMany({ where: { tenantId: { in: tenantIds } } }); } catch {}

  // Enquiries
  await prisma.enquiry.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Enquiries deleted");

  // Guardians
  await prisma.guardian.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Guardians deleted");

  // Fee structures & heads
  try {
    await prisma.feeStructure.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.feeHead.deleteMany({ where: { tenantId: { in: tenantIds } } });
  } catch {}
  console.log("  ✓ Fee structures & heads deleted");

  // Employees
  await prisma.employee.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Employees deleted");

  // Profiles
  await prisma.profile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Profiles deleted");

  // Sections, Classes, Programs, Templates, Academic years
  await prisma.section.deleteMany({ where: { tenantId: { in: tenantIds } } });
  try {
    await prisma.class.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.program.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.templateVersion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.template.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.academicYear.deleteMany({ where: { tenantId: { in: tenantIds } } });
  } catch {}
  console.log("  ✓ Academic structures deleted");

  // Campuses
  await prisma.campus.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ Campuses deleted");

  // Audit logs
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ AuditLogs deleted");

  // Tenant features
  await prisma.tenantFeature.deleteMany({ where: { tenantId: { in: tenantIds } } });
  console.log("  ✓ TenantFeatures deleted");

  // Tenants
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  console.log("  ✓ Tenants deleted");

  // 5. Delete tenant AuthUsers (not platform admins)
  if (usersToDelete.length > 0) {
    await prisma.authSession.deleteMany({ where: { userId: { in: usersToDelete } } });
    await prisma.authUser.deleteMany({ where: { id: { in: usersToDelete } } });
    console.log(`  ✓ ${usersToDelete.length} tenant AuthUser(s) deleted`);
  }

  console.log(`\n✅ Done. Deleted ${tenants.length} tenant(s) and ${usersToDelete.length} tenant user(s).`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
