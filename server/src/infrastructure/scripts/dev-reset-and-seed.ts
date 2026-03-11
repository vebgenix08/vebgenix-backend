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

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminAddUserToGroupCommand,
  MessageActionType,
} from "@aws-sdk/client-cognito-identity-provider";
import * as dotenv from "dotenv";
import * as path from "path";
import prisma from "../../infrastructure/prisma/client";

// Load .env from server directory
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";

if (!USER_POOL_ID) {
  console.error("❌ ERROR: COGNITO_USER_POOL_ID is not set in .env");
  process.exit(1);
}

const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION });

// Constants
const PLATFORM_SUPER_ADMIN_EMAIL = "dhanushags08@gmail.com";
const TENANT_A_ADMIN_EMAIL = "dhanushags1567@gmail.com";
const TENANT_A_ACCOUNTANT_EMAIL = "dhanushdhanush7765@gmail.com";
const TENANT_A_TEACHER_EMAIL = "dhananjay156708@gmail.com";
const TENANT_A_STUDENT_EMAIL = "codexdvg3010@gmail.com";

// Default temporary password for all seeded users
const DEFAULT_TEMP_PASSWORD = "TempPass@2024!";

/**
 * Helper: Idempotent Cognito User Creation
 * Creates user if they don't exist, then sets permanent password.
 */
async function getOrCreateCognitoUser(
  email: string,
  fullName: string,
  role: string,
  group?: string,
) {
  const normalizedEmail = email.toLowerCase().trim();
  let userId: string;
  let alreadyExisted = false;

  try {
    // Try to get existing user
    const getCmd = new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: normalizedEmail,
    });
    const existing = await cognitoClient.send(getCmd);
    userId = existing.Username!;
    alreadyExisted = true;
    console.log(`      ♻️  User already exists: ${normalizedEmail}`);

    // Update attributes
    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: normalizedEmail,
        UserAttributes: [
          { Name: "name", Value: fullName },
          { Name: "custom:role", Value: role },
          ...(group ? [{ Name: "custom:tenant_id", Value: group }] : []),
        ],
      }),
    );
  } catch (err: any) {
    if (err.name === "UserNotFoundException") {
      // Create new user
      const createCmd = new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: normalizedEmail,
        TemporaryPassword: DEFAULT_TEMP_PASSWORD,
        MessageAction: MessageActionType.SUPPRESS, // Don't send welcome email
        UserAttributes: [
          { Name: "email", Value: normalizedEmail },
          { Name: "email_verified", Value: "true" },
          { Name: "name", Value: fullName },
          { Name: "custom:role", Value: role },
          ...(group ? [{ Name: "custom:tenant_id", Value: group }] : []),
        ],
      });
      const created = await cognitoClient.send(createCmd);
      userId = created.User!.Username!;
      console.log(`      ✅ User created: ${normalizedEmail}`);
    } else {
      throw err;
    }
  }

  // Set permanent password (removes FORCE_CHANGE_PASSWORD state)
  await cognitoClient.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: normalizedEmail,
      Password: DEFAULT_TEMP_PASSWORD,
      Permanent: true,
    }),
  );

  // Add to group matching role name (if group exists)
  if (role) {
    try {
      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: normalizedEmail,
          GroupName: role,
        }),
      );
      console.log(`      ✅ Added to group: ${role}`);
    } catch (err: any) {
      console.warn(`      ⚠️ Could not add to group ${role}: ${err.message}`);
    }
  }

  return {
    id: userId!,
    email: normalizedEmail,
    alreadyExisted,
  };
}

/**
 * DEV-ONLY Reset and Seed Script
 */
async function devResetAndSeed() {
  // GUARD: Check environment
  if (process.env.NODE_ENV !== "development") {
    console.error("❌ ERROR: This script can only run in development mode");
    process.exit(1);
  }

  if (process.env.ALLOW_DEV_RESET !== "true") {
    console.error(
      "❌ ERROR: Set ALLOW_DEV_RESET=true in .env to enable dev reset",
    );
    process.exit(1);
  }

  console.log("🔄 Starting DEV RESET...\n");

  try {
    // ==========================================
    // PART A: DATABASE CLEANUP
    // ==========================================
    console.log("1️⃣ Cleaning up Tenant Data...");

    await prisma.userCampusAccess.deleteMany({});
    await prisma.tenantFeature.deleteMany({});
    await prisma.enquiry.deleteMany({});
    await prisma.applicationDocument.deleteMany({});
    await prisma.applicationReview.deleteMany({});
    await prisma.application.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.profile.deleteMany({});
    await prisma.campus.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.auditLog.deleteMany({});

    console.log("   ✅ Tenant data wiped.\n");

    // ==========================================
    // PART B: PLATFORM SUPER ADMIN (Cognito)
    // ==========================================
    console.log("2️⃣ Locking Platform Super Admin in Cognito...");

    const superAdminAuth = await getOrCreateCognitoUser(
      PLATFORM_SUPER_ADMIN_EMAIL,
      "Super Admin",
      "SUPER_ADMIN",
    );

    // Upsert into auth_users
    await prisma.authUser.upsert({
      where: { email: PLATFORM_SUPER_ADMIN_EMAIL },
      create: {
        id: superAdminAuth.id,
        email: PLATFORM_SUPER_ADMIN_EMAIL,
        status: "ACTIVE",
      },
      update: {
        status: "ACTIVE",
      },
    });

    // Guard: ensure no profile row for platform email
    await prisma.profile.deleteMany({
      where: { email: PLATFORM_SUPER_ADMIN_EMAIL },
    });

    console.log(`   ✅ Super Admin ready: ${PLATFORM_SUPER_ADMIN_EMAIL}\n`);

    // ==========================================
    // PART C: SEED TENANT 'a'
    // ==========================================
    console.log('3️⃣ Creating Tenant "a"...');

    const tenantA = await prisma.tenant.create({
      data: {
        name: "Tenant A",
        slug: "a",
        isActive: true,
        onboardingComplete: false,
      },
    });

    console.log(`   ✅ Tenant created: ${tenantA.id} (slug: a)`);

    const campusSchool = await prisma.campus.create({
      data: {
        tenantId: tenantA.id,
        name: "School 1",
        campusType: "SCHOOL",
        isActive: true,
      },
    });

    await prisma.campus.create({
      data: {
        tenantId: tenantA.id,
        name: "College",
        campusType: "PU",
        isActive: true,
      },
    });

    console.log(`   ✅ Campuses created: School 1, College`);

    const features = ["DASHBOARD", "ADMISSIONS", "FINANCE"];
    await prisma.tenantFeature.createMany({
      data: features.map((key) => ({
        tenantId: tenantA.id,
        featureKey: key,
        enabled: true,
      })),
    });
    console.log(`   ✅ Features enabled: ${features.join(", ")}\n`);

    // ==========================================
    // PART D: SEED TENANT USERS (Cognito)
    // ==========================================
    console.log("4️⃣ Seeding Tenant Users into Cognito...");

    const usersToSeed = [
      {
        email: TENANT_A_ADMIN_EMAIL,
        name: "Tenant Admin",
        role: "ADMIN",
        allCampuses: true,
        restrictedTo: null as string | null,
      },
      {
        email: TENANT_A_ACCOUNTANT_EMAIL,
        name: "Accountant User",
        role: "ACCOUNTANT",
        allCampuses: true,
        restrictedTo: null as string | null,
      },
      {
        email: TENANT_A_TEACHER_EMAIL,
        name: "Teacher User",
        role: "TEACHER",
        allCampuses: false,
        restrictedTo: campusSchool.id,
      },
      {
        email: TENANT_A_STUDENT_EMAIL,
        name: "Student User",
        role: "STUDENT",
        allCampuses: false,
        restrictedTo: campusSchool.id,
      },
    ];

    for (const u of usersToSeed) {
      console.log(`   Processing ${u.role}: ${u.email}...`);

      const auth = await getOrCreateCognitoUser(
        u.email,
        u.name,
        u.role,
        tenantA.id, // Pass tenant_id as Cognito attribute
      );

      // Upsert DB profile
      await prisma.profile.upsert({
        where: { id: auth.id },
        create: {
          id: auth.id,
          tenantId: tenantA.id,
          email: u.email,
          fullName: u.name,
          role: u.role as any,
          allCampusesAccess: u.allCampuses,
          campusScope:
            u.role === "TEACHER" || u.role === "STUDENT" ? "SCHOOL" : null,
          isActive: true,
        },
        update: {
          tenantId: tenantA.id,
          email: u.email,
          fullName: u.name,
          role: u.role as any,
          allCampusesAccess: u.allCampuses,
          campusScope:
            u.role === "TEACHER" || u.role === "STUDENT" ? "SCHOOL" : null,
          isActive: true,
        },
      });

      // Campus access
      if (!u.allCampuses && u.restrictedTo) {
        await prisma.userCampusAccess.deleteMany({
          where: { profileId: auth.id },
        });
        await prisma.userCampusAccess.create({
          data: {
            tenantId: tenantA.id,
            profileId: auth.id,
            campusId: u.restrictedTo,
          },
        });
      } else if (u.allCampuses) {
        await prisma.userCampusAccess.deleteMany({
          where: { profileId: auth.id },
        });
      }
    }

    console.log("\n=======================================================");
    console.log("✅ SEEDING COMPLETE");
    console.log("=======================================================");
    console.log(`\nAll users have password: ${DEFAULT_TEMP_PASSWORD}\n`);
    console.log(`Super Admin:  ${PLATFORM_SUPER_ADMIN_EMAIL}`);
    console.log(`Tenant Admin: ${TENANT_A_ADMIN_EMAIL}`);
    console.log(`Accountant:   ${TENANT_A_ACCOUNTANT_EMAIL}`);
    console.log(`Teacher:      ${TENANT_A_TEACHER_EMAIL} (School Only)`);
    console.log(`Student:      ${TENANT_A_STUDENT_EMAIL} (School Only)`);
    console.log("=======================================================\n");
  } catch (error: any) {
    console.error("\n❌ DEV RESET FAILED:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run
devResetAndSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
