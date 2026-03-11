
import { PrismaClient, MembershipRole } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateAuth() {
  console.log('Starting Auth Migration...');

  try {
    // 1. Migrate Platform Users
    const platformUsers = await prisma.platformUser.findMany();
    console.log(`Found ${platformUsers.length} Platform Users.`);

    for (const pu of platformUsers) {
      console.log(`Migrating Platform User: ${pu.email}`);
      
      // Check if AuthUser exists
      const existingUser = await prisma.authUser.findUnique({ where: { email: pu.email } });
      if (existingUser) {
        console.error(`CONFLICT: AuthUser already exists for ${pu.email}. Skipping PlatformUser migration for this email.`);
        continue;
      }

      // Create AuthUser
      const newUser = await prisma.authUser.create({
        data: {
          email: pu.email,
          passwordHash: pu.passwordHash,
          status: pu.isActive ? 'ACTIVE' : 'DISABLED',
          // Assuming reset tokens are not compatible or worth migrating for security, forcing re-request if needed.
        }
      });

      // Assign Global Role
      await prisma.authUserGlobalRole.create({
        data: {
          userId: newUser.id,
          role: 'PLATFORM_SUPER_ADMIN'
        }
      });
    }

    // 2. Migrate Profiles
    const profiles = await prisma.profile.findMany();
    console.log(`Found ${profiles.length} Profiles.`);

    for (const profile of profiles) {
      console.log(`Migrating Profile: ${profile.email} (Tenant: ${profile.tenantId})`);

      let authUserId = '';

      // Check if AuthUser exists
      const existingUser = await prisma.authUser.findUnique({ where: { email: profile.email } });
      
      if (existingUser) {
        console.log(`AuthUser exists for ${profile.email}. Linking...`);
        authUserId = existingUser.id;
      } else {
        // Create new AuthUser
        const newUser = await prisma.authUser.create({
          data: {
            email: profile.email,
            passwordHash: profile.passwordHash,
            status: profile.isActive ? 'ACTIVE' : 'DISABLED',
          }
        });
        authUserId = newUser.id;
      }

      // Map Role
      let membershipRole: MembershipRole = 'STAFF'; // Default
      switch (profile.role) {
        case 'ADMIN': membershipRole = 'ORG_ADMIN'; break;
        case 'TEACHER': membershipRole = 'TEACHER'; break;
        case 'STUDENT': membershipRole = 'STUDENT'; break;
        case 'PARENT': membershipRole = 'PARENT'; break;
        case 'ACCOUNTANT': membershipRole = 'ACCOUNTANT'; break;
        case 'STAFF': membershipRole = 'STAFF'; break;
        default: membershipRole = 'STAFF';
      }

      // Create Tenant Membership
      // Check duplicate
      const existingMembership = await prisma.tenantMembership.findUnique({
        where: {
            userId_tenantId_role: {
                userId: authUserId,
                tenantId: profile.tenantId,
                role: membershipRole
            }
        }
      });

      if (!existingMembership) {
          await prisma.tenantMembership.create({
            data: {
              userId: authUserId,
              tenantId: profile.tenantId,
              role: membershipRole,
              campusScope: profile.campusScope || 'ALL',
              status: profile.isActive ? 'ACTIVE' : 'DISABLED',
              primaryProfileId: profile.id
            }
          });
      }

      // Create User Profile Link
      const existingLink = await prisma.userProfileLink.findUnique({
          where: {
              userId_profileId: {
                  userId: authUserId,
                  profileId: profile.id
              }
          }
      });

      if (!existingLink) {
          await prisma.userProfileLink.create({
            data: {
              userId: authUserId,
              profileId: profile.id,
              relationship: 'SELF',
              isPrimary: true 
            }
          });
      }
    }

    console.log('Migration Completed Successfully.');

  } catch (error) {
    console.error('Migration Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateAuth();
