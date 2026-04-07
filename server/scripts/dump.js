const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.authUser.findMany();
  fs.writeFileSync('users-dump.json', JSON.stringify(users, null, 2));
  console.log('Dumped to users-dump.json');
}

main().catch(console.error).finally(() => prisma.$disconnect());
