/**
 * ⚠️ WARNING: DO NOT RUN THIS SCRIPT WITHOUT EXPLICIT PERMISSION
 * 
 * This script is destructive and will:
 * 1. Wipe all tenants, profiles, and related data (students, applications, etc.)
 * 2. Truncate audit logs
 * 3. Reset the database to a clean slate
 * 
 * Improper use will result in DATA LOSS and SYSTEM CORRUPTION.
 * Ensure you have permission from the project owner before execution.
 */

import { supabase } from '../supabase/client';
import { EmailService } from '../../services/EmailService';
import * as dotenv from 'dotenv';
import * as path from 'path';
import prisma from '../../infrastructure/prisma/client';

// Load .env from server directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Create EmailService instance AFTER dotenv loads
const emailService = new EmailService();

// Constants
const PLATFORM_SUPER_ADMIN_EMAIL = 'dhanushags08@gmail.com';
const TENANT_A_ADMIN_EMAIL = 'dhanushags1567@gmail.com';
const TENANT_A_ACCOUNTANT_EMAIL = 'dhanushdhanush7765@gmail.com';
const TENANT_A_TEACHER_EMAIL = 'dhananjay156708@gmail.com';
const TENANT_A_STUDENT_EMAIL = 'codexdvg3010@gmail.com';

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

/**
 * Helper: Idempotent Auth User Creation
 */
async function getOrCreateAuthUserByEmail(email: string, fullName: string, role: string) {
  const normalizedEmail = email.toLowerCase().trim();
  
  // 1. Try to find existing
  let user = null;
  let page = 1;
  const perPage = 100;
  
  while (true) {
      const { data: listData } = await supabase.auth.admin.listUsers({ page, perPage });
      if (!listData?.users || listData.users.length === 0) break;
      
      const found = listData.users.find(u => u.email?.toLowerCase() === normalizedEmail);
      if (found) {
          user = found;
          break;
      }
      page++;
  }

  let alreadyExisted = !!user;
  let inviteLink = null;

  if (user) {
    // Hard guard for Super Admin email
    if (normalizedEmail === 'dhanushags08@gmail.com' && role !== 'SUPER_ADMIN') {
        throw new Error('dhanushags08@gmail.com MUST be SUPER_ADMIN');
    }

    // Update metadata
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { full_name: fullName, role }
    });
    
    // Force invite resend if requested (using recovery link as "invite")
    // NOTE: Supabase doesn't let you re-generate an "invite" link for a confirmed user easily.
    // We use a recovery link (password reset) as a substitute for "re-inviting" existing users.
    if (process.env.SEND_INVITES === 'true') {
        const { data: linkData } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: { redirectTo: `${APP_BASE_URL}/auth/callback?next=/change-password` }
        });
        inviteLink = linkData.properties?.action_link;
    }
  } else {
    // Create new
    const { data: newData, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { full_name: fullName, role }
    });
    
    if (createError) throw createError;
    user = newData.user!;
    
    // Generate Invite Link
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo: `${APP_BASE_URL}/auth/callback` }
    });
    inviteLink = linkData.properties?.action_link;
  }

  return { 
    id: user!.id, 
    email: normalizedEmail, 
    alreadyExisted, 
    inviteLink 
  };
}

/**
 * DEV-ONLY Reset and Seed Script
 */
async function devResetAndSeed() {
  // GUARD: Check environment
  if (process.env.NODE_ENV !== 'development') {
    console.error('❌ ERROR: This script can only run in development mode');
    process.exit(1);
  }

  if (process.env.ALLOW_DEV_RESET !== 'true') {
    console.error('❌ ERROR: Set ALLOW_DEV_RESET=true in .env to enable dev reset');
    process.exit(1);
  }

  console.log('🔄 Starting DEV RESET...\n');

  try {
    // ==========================================
    // PART A: DATABASE GUARDS (RAW SQL)
    // ==========================================
    console.log('0️⃣ Applying Database Guards...');
    
    // 1. Trigger to prevent Platform Email in Profiles
    // We need to create a function and trigger.
    // Note: We use executeRawUnsafe because Prisma doesn't support trigger creation in schema.
    
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION prevent_platform_email_in_profiles()
      RETURNS TRIGGER AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM platform_users WHERE email = NEW.email) THEN
          RAISE EXCEPTION 'PLATFORM_EMAIL_FORBIDDEN: Email % belongs to platform_users', NEW.email;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await prisma.$executeRawUnsafe(`
      DROP TRIGGER IF EXISTS check_platform_email_profile ON profiles;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER check_platform_email_profile
      BEFORE INSERT OR UPDATE ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION prevent_platform_email_in_profiles();
    `);

    console.log('   ✅ Trigger applied: prevent_platform_email_in_profiles\n');


    // ==========================================
    // PART B: CLEANUP
    // ==========================================
    console.log('1️⃣ Cleaning up Tenant Data...');
    
    // Delete in order of constraints
    await prisma.userCampusAccess.deleteMany({});
    await prisma.tenantFeature.deleteMany({});
    await prisma.enquiry.deleteMany({});
    await prisma.applicationDocument.deleteMany({});
    await prisma.applicationReview.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.profile.deleteMany({}); // This wipes all tenant users
    await prisma.campus.deleteMany({});
    await prisma.tenant.deleteMany({}); // Cascades usually, but explicit is safer
    await prisma.auditLog.deleteMany({});
    
    console.log('   ✅ Tenant data wiped.');

    // Ensure Platform User Table exists (it should via schema, but let's just use it)
    // We do NOT delete platform_users table, but we ensure our Super Admin is there.
    
    
    // ==========================================
    // PART C: PLATFORM SUPER ADMIN
    // ==========================================
    console.log('2️⃣ Locking Platform Super Admin...');
    
    // 1. Get/Create Auth User for Super Admin
    const superAdminAuth = await getOrCreateAuthUserByEmail(
      PLATFORM_SUPER_ADMIN_EMAIL, 
      'Super Admin', 
      'SUPER_ADMIN'
    );

    // 2. Upsert into platform_users
    await prisma.platformUser.upsert({
      where: { email: PLATFORM_SUPER_ADMIN_EMAIL },
      create: {
        id: superAdminAuth.id,
        email: PLATFORM_SUPER_ADMIN_EMAIL,
        fullName: 'Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true
      },
      update: {
        role: 'SUPER_ADMIN', // Force role
        isActive: true
      }
    });

    // 3. HARD DELETE any profile that might match this email (just in case)
    // The trigger prevents new ones, but let's clear old junk if trigger wasn't there before
    // Need to temporarily disable trigger or handle exception if we were to insert, but here we DELETE.
    // Deleting from profiles is allowed even if email is in platform_users.
    await prisma.profile.deleteMany({ where: { email: PLATFORM_SUPER_ADMIN_EMAIL } });

    console.log(`   ✅ Super Admin Locked: ${PLATFORM_SUPER_ADMIN_EMAIL} (${superAdminAuth.id})\n`);


    // ==========================================
    // PART D: SEED TENANT 'a'
    // ==========================================
    console.log('3️⃣ Creating Tenant "a"...');
    
    const tenantA = await prisma.tenant.create({
      data: {
        name: 'Tenant A',
        subdomain: 'a',
        isActive: true,
        onboardingComplete: false
      }
    });

    console.log(`   ✅ Tenant created: ${tenantA.id} (subdomain: a)`);

    // Campuses
    const campusSchool = await prisma.campus.create({
      data: {
        tenantId: tenantA.id,
        name: 'School 1',
        campusType: 'SCHOOL',
        isActive: true
      }
    });
    
    await prisma.campus.create({
      data: {
        tenantId: tenantA.id,
        name: 'College',
        campusType: 'PU',
        isActive: true
      }
    });

    console.log(`   ✅ Campuses created: School 1, College`);

    // Features
    const features = ['DASHBOARD', 'ADMISSIONS', 'FINANCE'];
    await prisma.tenantFeature.createMany({
      data: features.map(key => ({
        tenantId: tenantA.id,
        featureKey: key,
        enabled: true
      }))
    });
    console.log(`   ✅ Features enabled: ${features.join(', ')}\n`);


    // ==========================================
    // PART E: SEED TENANT USERS
    // ==========================================
    console.log('4️⃣ Seeding Tenant Users...');

    const usersToSeed = [
      {
        email: TENANT_A_ADMIN_EMAIL,
        name: 'Tenant Admin',
        role: 'ADMIN',
        allCampuses: true,
        restrictedTo: null
      },
      {
        email: TENANT_A_ACCOUNTANT_EMAIL,
        name: 'Accountant User',
        role: 'ACCOUNTANT',
        allCampuses: true,
        restrictedTo: null
      },
      {
        email: TENANT_A_TEACHER_EMAIL,
        name: 'Teacher User',
        role: 'TEACHER',
        allCampuses: false,
        restrictedTo: campusSchool.id
      },
      {
        email: TENANT_A_STUDENT_EMAIL,
        name: 'Student User',
        role: 'STUDENT',
        allCampuses: false,
        restrictedTo: campusSchool.id
      }
    ];

    for (const u of usersToSeed) {
      console.log(`   Processing ${u.role}: ${u.email}...`);
      
      // 1. Auth User
      const auth = await getOrCreateAuthUserByEmail(u.email, u.name, u.role);
      
      // 2. Profile
      await prisma.profile.upsert({
        where: { id: auth.id },
        create: {
          id: auth.id,
          tenantId: tenantA.id,
          email: u.email,
          fullName: u.name,
          role: u.role as any,
          allCampusesAccess: u.allCampuses,
          campusScope: u.role === 'TEACHER' || u.role === 'STUDENT' ? 'SCHOOL' : null,
          isActive: true
        },
        update: {
          tenantId: tenantA.id,
          email: u.email,
          fullName: u.name,
          role: u.role as any,
          allCampusesAccess: u.allCampuses,
          campusScope: u.role === 'TEACHER' || u.role === 'STUDENT' ? 'SCHOOL' : null,
          isActive: true
        }
      });

      // 3. Access (Idempotent)
      if (!u.allCampuses && u.restrictedTo) {
        // Clear old access for this user
        await prisma.userCampusAccess.deleteMany({ where: { userId: auth.id } });
        
        await prisma.userCampusAccess.create({
          data: {
            tenantId: tenantA.id,
            userId: auth.id,
            campusId: u.restrictedTo
          }
        });
      } else if (u.allCampuses) {
         // Clear explicit access if they have all access
         await prisma.userCampusAccess.deleteMany({ where: { userId: auth.id } });
      }

      // 4. First Admin Lock
      if (u.role === 'ADMIN' && u.email === TENANT_A_ADMIN_EMAIL) {
        await prisma.tenant.update({
          where: { id: tenantA.id },
          data: { firstAdminId: auth.id }
        });
        console.log('      🔒 Locked as First Admin');
      }

      // 5. Send Invite
      if (auth.inviteLink) {
        console.log(`      📩 Sending invite/recovery...`);
        // Use proper tenant URL for invite
        const tenantUrl = `http://a.erp.test:5173`; // Dev fixed
        await emailService.sendInviteEmail(
          u.email,
          auth.inviteLink,
          'Tenant A',
          `${tenantUrl}/login`
        );
        console.log(`      🔗 Link: ${auth.inviteLink}`);
      } else {
        console.log(`      ℹ️  User existed, no link generated (SEND_INVITES != true)`);
      }
    }

    console.log('\n=======================================================');
    console.log('✅ SEEDING COMPLETE');
    console.log('=======================================================');
    console.log(`Tenant: Tenant A (a)`);
    console.log(`Super Admin: ${PLATFORM_SUPER_ADMIN_EMAIL} (Platform Dashboard)`);
    console.log(`Tenant Admin: ${TENANT_A_ADMIN_EMAIL}`);
    console.log(`Accountant:   ${TENANT_A_ACCOUNTANT_EMAIL}`);
    console.log(`Teacher:      ${TENANT_A_TEACHER_EMAIL} (School Only)`);
    console.log(`Student:      ${TENANT_A_STUDENT_EMAIL} (School Only)`);
    console.log('=======================================================\n');

  } catch (error: any) {
    console.error('\n❌ DEV RESET FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run
devResetAndSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
