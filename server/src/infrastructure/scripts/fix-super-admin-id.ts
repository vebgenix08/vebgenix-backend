import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'ags@vebgenix.com';
  const cognitoSub = 'b1c31dea-c0a1-7038-95ac-72f931eea28b';

  console.log(`Fixing ID for ${email} -> ${cognitoSub}`);

  // 1. Delete existing record (and cascade delete roles)
  // We use deleteMany to avoid error if not found
  try {
    await prisma.authUser.delete({ where: { email } });
    console.log('Deleted old record.');
  } catch (e) {
    console.log('No old record found or delete failed (ignoring).');
  }

  // 2. Create new record with CORRECT ID
  const user = await prisma.authUser.create({
    data: {
      id: cognitoSub,
      email,
      status: 'ACTIVE',
      globalRoles: {
        create: { role: 'PLATFORM_SUPER_ADMIN' }
      }
    }
  });

  console.log('Fixed User:', user);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
