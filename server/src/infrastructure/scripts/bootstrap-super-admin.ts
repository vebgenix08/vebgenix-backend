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

  console.log(`Super Admin Created: ${user.id}`);
  console.log('Ensure this email exists in your Cognito User Pool to log in.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
