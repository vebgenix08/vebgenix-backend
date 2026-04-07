const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const targetEmail = 'dhanushags01@gmail.com';
  
  console.log(`Searching for lingering user with email: ${targetEmail}`);
  const user = await prisma.authUser.findUnique({
    where: { email: targetEmail }
  });

  if (user) {
    console.log(`Found lingering AuthUser with ID: ${user.id}`);
    console.log('Deleting...');
    
    // Find related profiles to safely cascade
    const profiles = await prisma.profile.findMany({
      where: { email: targetEmail }
    });
    
    for (const p of profiles) {
      console.log(`Deleting Profile: ${p.id}`);
      await prisma.profile.delete({ where: { id: p.id } });
    }

    // Delete memberships first to avoid constraint errors if not cascaded
    await prisma.tenantMembership.deleteMany({
      where: { userId: user.id }
    });

    await prisma.authUser.delete({
      where: { id: user.id }
    });
    console.log('Successfully deleted the lingering AuthUser.');
  } else {
    console.log('No AuthUser found with that email.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
