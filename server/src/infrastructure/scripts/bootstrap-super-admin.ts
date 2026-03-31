import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@vebgenix.com';

  console.log(`Bootstrapping Super Admin: ${email}`);

  // 1. Create AuthUser
  const user = await prisma.authUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      status: 'ACTIVE'
    }
  });

  // 2. Assign Global Role
  await prisma.authUserGlobalRole.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: 'PLATFORM_SUPER_ADMIN'
      }
    },
    update: {},
    create: {
      userId: user.id,
      role: 'PLATFORM_SUPER_ADMIN'
    }
  });

  // 3. Remove PLATFORM_SUPER_ADMIN from any other users that shouldn't have it
  const wrongSuperAdmins = await prisma.authUserGlobalRole.findMany({
    where: {
      role: 'PLATFORM_SUPER_ADMIN',
      userId: { not: user.id },
    },
    include: { user: { select: { email: true } } },
  });

  for (const record of wrongSuperAdmins) {
    console.warn(`Removing PLATFORM_SUPER_ADMIN from wrong user: ${record.user.email}`);
    await prisma.authUserGlobalRole.delete({
      where: { userId_role: { userId: record.userId, role: 'PLATFORM_SUPER_ADMIN' } },
    });
  }

  console.log(`Super Admin ready: ${email} (${user.id})`);
  if (wrongSuperAdmins.length > 0) {
    console.log(`Cleaned up ${wrongSuperAdmins.length} incorrect super admin record(s).`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
