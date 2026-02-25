"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    try {
        console.log("START_PRISMA_TEST");
        await prisma.$connect();
        console.log("CONNECTED");
        const count = await prisma.profile.count();
        console.log("COUNT:", count);
        console.log("END_PRISMA_TEST_SUCCESS");
    }
    catch (e) {
        console.error("PRISMA_TEST_FAILED");
        console.error(e.message);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main();
//# sourceMappingURL=debug_prisma.js.map