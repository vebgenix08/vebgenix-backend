// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'ags@vebgenix.com';
  console.log(`Seeding Demo Tenant for: ${email}`);

  const user = await prisma.authUser.findUnique({ where: { email } });
  if (!user) {
    console.error('User not found!');
    return;
  }

  // 1. Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Vebgenix Demo School',
      slug: 'demo-school',
      status: 'ACTIVE',
      contactEmail: email,
      contactPhone: '1234567890',
      subscriptionPlan: 'ENTERPRISE',
      config: {},
    }
  });

  // 2. Create Profile & Membership
  const profile = await prisma.profile.create({
    data: {
      tenantId: tenant.id,
      email: email,
      fullName: 'Super Admin User',
      type: 'STAFF',
      status: 'ACTIVE'
    }
  });

  // 3. Create TenantMembership (Owner)
  await prisma.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: 'PRIMARY_OWNER',
      status: 'ACTIVE',
      primaryProfileId: profile.id
    }
  });

  // 4. Link User -> Profile
  await prisma.userProfileLink.create({
    data: {
      userId: user.id,
      profileId: profile.id
    }
  });

  console.log('Demo Tenant Created!');
  console.log(`Tenant ID: ${tenant.id}`);
  console.log('You should now have access to Tenant Dashboard.');
}

main().finally(() => prisma.$disconnect());
