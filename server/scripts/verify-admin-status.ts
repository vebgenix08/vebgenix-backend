import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'ags@vebgenix.com';
  console.log(`Checking user: ${email}`);

  const user = await prisma.authUser.findUnique({
    where: { email },
    include: { globalRoles: true, memberships: true }
  });

  if (!user) {
    console.error('USER NOT FOUND IN DB!');
    return;
  }

  console.log('User ID:', user.id);
  console.log('Global Roles:', JSON.stringify(user.globalRoles, null, 2));
  console.log('Memberships Count:', user.memberships.length);

  const isSuper = user.globalRoles.some(r => r.role === 'PLATFORM_SUPER_ADMIN');
  console.log('Is Super Admin (DB Check):', isSuper);
}

main().finally(() => prisma.$disconnect());
