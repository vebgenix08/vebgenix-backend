
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const email = 'dhanushags08@gmail.com';

async function createSuperAdmin() {
  console.log(`Creating super admin: ${email}`);

  try {
    // 1. Create in platform_users table (using raw SQL as per model definition for uuid)
    // Note: The model says id is uuid. We generate one.
    const id = uuidv4();
    
    await prisma.$executeRaw`
      INSERT INTO platform_users (id, email, full_name, role, is_active, created_at)
      VALUES (${id}::uuid, ${email}, 'Super Admin', 'SUPER_ADMIN', true, NOW())
      ON CONFLICT (email) DO UPDATE SET role = 'SUPER_ADMIN', is_active = true;
    `;
    
    console.log('Successfully created/updated platform_user record.');

  } catch (error) {
    console.error('Error creating super admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();
