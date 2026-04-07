"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.authUser.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, email: true, createdAt: true },
    });
    console.log(JSON.stringify(users, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

