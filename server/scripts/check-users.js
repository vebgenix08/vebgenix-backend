const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.authUser.findMany({ select: { id: true, email: true }});
  console.log('--- AuthUsers ---');
  users.forEach(u => console.log(u.email, '->', u.id));
  
  const memberships = await prisma.tenantMembership.findMany({ include: { user: true }});
  console.log('--- Memberships ---');
  memberships.forEach(m => console.log(m.user.email, 'Tenant:', m.tenantId, 'Role:', m.role));
}

main().catch(console.error).finally(() => prisma.$disconnect());
