
import path from 'path';
import dotenv from 'dotenv';

// Load .env from server directory explicitly
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('localhost', '127.0.0.1');
  console.log('Modified DATABASE_URL to use 127.0.0.1');
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

async function checkColumns() {
  try {
    console.log('Checking Campus columns...');
    const campusCols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'campuses';
    `);
    console.log('Campuses:', JSON.stringify(campusCols, null, 2));

    console.log('Checking TenantFeature columns...');
    const featureCols = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tenant_features';
    `);
    console.log('TenantFeatures:', JSON.stringify(featureCols, null, 2));

  } catch (error) {
    console.error('Error checking columns:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkColumns();
