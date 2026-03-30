import { AuditLogger } from "./AuditLogger";
import { emailService } from "./EmailService";
import prisma from "../infrastructure/prisma/client";
import { grantAdminDashboardPerms } from "../../scripts/grant-admin-dashboard-perms";
import crypto from "crypto";
import { generateInviteOtp } from "../domain/identity/invite-otp";
import { publishEventBridgeEvent } from "../infrastructure/aws/eventbridge";

/**
 * Platform
 * Business logic for platform admin operations
 *
 * CRITICAL RULES:
 * 1. All mutations are transactional
 * 2. Emails sent AFTER transaction commits
 * 3. Email failure does NOT rollback DB
 * 4. One email = one tenant only
 * 5. Platform emails cannot be in profiles
 * 6. No orphaned auth users
 */

interface CreateTenantResult {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  onboarding_complete: boolean;
}

import { CampusType } from "@prisma/client";

interface CreateCampusResult {
  id: string;
  tenant_id: string;
  name: string;
  campus_type: CampusType;
  is_active: boolean;
}

interface CreateFirstAdminResult {
  userId: string;
  alreadyExisted: boolean;
  inviteSent: boolean;
  inviteLink?: string; // Only in development
}

const DEFAULT_SCHOOL_PROGRAMS = [
  "1st Standard",
  "2nd Standard",
  "3rd Standard",
  "4th Standard",
  "5th Standard",
  "6th Standard",
  "7th Standard",
  "8th Standard",
  "9th Standard",
  "10th Standard",
];

const DEFAULT_PU_PROGRAMS = ["1st Year PUC", "2nd Year PUC"];
const REQUIRED_ALWAYS_ON_FEATURES = ["DASHBOARD", "ADMISSIONS"] as const;
const DEFAULT_TENANT_FEATURES = [
  ...REQUIRED_ALWAYS_ON_FEATURES,
  "ACADEMICS",
  "ATTENDANCE",
  "FINANCE",
  "EXAMS",
  "HOSTEL",
  "TRANSPORT",
] as const;

export class PlatformService {
  static normalizeTenantFeatures(
    features?: Array<{ feature_key: string; enabled: boolean }>,
  ): Array<{ feature_key: string; enabled: boolean }> {
    const featureMap = new Map<string, boolean>();

    for (const featureKey of DEFAULT_TENANT_FEATURES) {
      featureMap.set(featureKey, true);
    }

    for (const feature of features ?? []) {
      if (!feature?.feature_key) continue;
      featureMap.set(feature.feature_key, feature.enabled);
    }

    for (const featureKey of REQUIRED_ALWAYS_ON_FEATURES) {
      featureMap.set(featureKey, true);
    }

    return Array.from(featureMap.entries()).map(([feature_key, enabled]) => ({
      feature_key,
      enabled,
    }));
  }

  static async ensureRequiredTenantFeatures(tenantId: string): Promise<void> {
    await prisma.$transaction(
      REQUIRED_ALWAYS_ON_FEATURES.map((featureKey) =>
        prisma.tenantFeature.upsert({
          where: {
            tenantId_featureKey: {
              tenantId,
              featureKey,
            },
          },
          create: {
            tenantId,
            featureKey,
            enabled: true,
          },
          update: {
            enabled: true,
          },
        }),
      ),
    );
  }

  private static getDefaultAcademicYearWindow() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;

    return {
      name: `${startYear}-${endYear}`,
      startDate: new Date(startYear, 3, 1),
      endDate: new Date(endYear, 2, 31),
    };
  }

  static async ensureTenantSetupDefaults(
    tenantId: string,
    campusTypes: CampusType[],
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const activeCampusTypes = Array.from(new Set(campusTypes));

      const academicYearCount = await tx.academicYear.count({
        where: { tenantId },
      });

      if (academicYearCount === 0) {
        const defaultYear = this.getDefaultAcademicYearWindow();
        await tx.academicYear.create({
          data: {
            tenantId,
            name: defaultYear.name,
            startDate: defaultYear.startDate,
            endDate: defaultYear.endDate,
            isActive: true,
            isClosed: false,
          },
        });
      }

      const existingPrograms = await tx.program.findMany({
        where: { tenantId },
        select: { name: true },
      });
      const existingNames = new Set(
        existingPrograms.map((program) => program.name.toLowerCase()),
      );

      const nextPrograms: Array<{ name: string; type: string }> = [];

      if (activeCampusTypes.includes("SCHOOL")) {
        for (const name of DEFAULT_SCHOOL_PROGRAMS) {
          if (!existingNames.has(name.toLowerCase())) {
            nextPrograms.push({ name, type: "SCHOOL" });
          }
        }
      }

      if (activeCampusTypes.includes("PU")) {
        for (const name of DEFAULT_PU_PROGRAMS) {
          if (!existingNames.has(name.toLowerCase())) {
            nextPrograms.push({ name, type: "PU" });
          }
        }
      }

      if (nextPrograms.length > 0) {
        await tx.program.createMany({
          data: nextPrograms.map((program) => ({
            tenantId,
            name: program.name,
            type: program.type,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  /**
   * Create a new tenant
   *
   * Validates:
   * - Slug format (lowercase, alphanumeric, hyphens)
   * - Slug uniqueness
   */
  static async createTenant(
    name: string,
    slug: string | null,
    actorId: string,
    features?: Array<{ feature_key: string; enabled: boolean }>,
  ): Promise<CreateTenantResult> {
    // Validate slug format if provided
    if (slug) {
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(slug)) {
        throw new Error(
          "Slug must be lowercase alphanumeric with hyphens only",
        );
      }

      // Check uniqueness
      const existing = await prisma.tenant.findUnique({
        where: { slug },
      });

      if (existing) {
        const error: any = new Error("Slug already exists");
        error.code = "SLUG_EXISTS";
        error.statusCode = 409;
        throw error;
      }
    }

    const requestedFeatures = this.normalizeTenantFeatures(features);

    const tenant = await prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          name,
          slug: slug || null,
          isActive: true,
          onboardingComplete: false,
        },
      });

      await tx.tenantFeature.createMany({
        data: requestedFeatures.map((feature) => ({
          tenantId: createdTenant.id,
          featureKey: feature.feature_key,
          enabled: feature.enabled,
        })),
        skipDuplicates: true,
      });

      return createdTenant;
    });

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "CREATE_TENANT",
      targetType: "tenant",
      targetId: tenant.id,
      tenantId: tenant.id,
      after: { name, slug, features: requestedFeatures },
    });

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      is_active: tenant.isActive,
      onboarding_complete: tenant.onboardingComplete,
    };
  }

  /**
   * Create a campus for a tenant
   */
  static async createCampus(
    tenantId: string,
    name: string,
    campusType: CampusType,
    actorId: string,
  ): Promise<CreateCampusResult> {
    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      const error: any = new Error("Tenant not found");
      error.statusCode = 404;
      throw error;
    }

    // Create campus
    const campus = await prisma.campus.create({
      data: {
        tenantId,
        name,
        campusType,
        isActive: true,
      },
    });

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "CREATE_CAMPUS",
      targetType: "campus",
      targetId: campus.id,
      tenantId,
      campusId: campus.id,
      after: { name, campus_type: campusType },
    });

    await this.ensureTenantSetupDefaults(tenantId, [campusType]);

    return {
      id: campus.id,
      tenant_id: campus.tenantId,
      name: campus.name,
      campus_type: campus.campusType,
      is_active: campus.isActive,
    };
  }

  /**
   * Create primary Admin for a tenant
   * Uses AuthUser + TenantMembership (no PlatformUser)
   */
  static async createFirstAdmin(
    tenantId: string,
    email: string,
    fullName: string,
    actorId: string,
    sendInvite: boolean = true,
  ): Promise<CreateFirstAdminResult> {
    // Normalize: trim whitespace then lowercase (Rule 3)
    const emailLower = email.trim().toLowerCase();

    // Step 1: Validate email not belonging to a platform super admin
    const globalRole = await prisma.authUserGlobalRole.findFirst({
      where: {
        user: { email: emailLower },
        role: "PLATFORM_SUPER_ADMIN",
      },
    });

    if (globalRole) {
      const error: any = new Error(
        "Email belongs to platform admin and cannot be used for tenant",
      );
      error.code = "EMAIL_IS_PLATFORM";
      error.statusCode = 409;
      throw error;
    }

    // Step 2: Check if email is already a primary admin for ANY tenant (Rule 5 & 6)
    // Email is a globally unique login identity — it cannot bootstrap more than one tenant.
    const existingPrimaryMembership = await prisma.tenantMembership.findFirst({
      where: {
        isPrimaryAdmin: true,
        user: { email: emailLower },
      },
    });

    if (existingPrimaryMembership) {
      const error: any = new Error(
        "This email is already the primary admin of another tenant and cannot be reused.",
      );
      error.code = "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS";
      error.statusCode = 409;
      throw error;
    }

    // Step 3: Create or reuse auth user
    const authUser = await prisma.authUser.findUnique({
      where: { email: emailLower },
    });

    let userId: string;
    let alreadyExisted = false;

    if (authUser) {
      userId = authUser.id;
      alreadyExisted = true;
    } else {
      const newUser = await prisma.authUser.create({
        data: { email: emailLower, status: "ACTIVE" },
      });
      userId = newUser.id;
    }

    // Step 3: Create or update profile
    await prisma.profile.upsert({
      where: { id: userId },
      create: {
        id: userId,
        tenantId,
        email: emailLower,
        fullName,
        role: "ADMIN",
        campusScope: "ALL",
        allCampusesAccess: true,
        isActive: true,
      },
      update: {
        tenantId,
        fullName,
        role: "ADMIN",
        campusScope: "ALL",
        allCampusesAccess: true,
        isActive: true,
      },
    });

    await prisma.userProfileLink.upsert({
      where: {
        userId_profileId: {
          userId,
          profileId: userId,
        },
      },
      create: {
        userId,
        profileId: userId,
        relationship: "SELF",
        isPrimary: true,
      },
      update: {
        isPrimary: true,
      },
    });

    await prisma.userCampusAccess.deleteMany({
      where: { tenantId, profileId: userId },
    });

    const membershipStatus = sendInvite
      ? ("INVITED" as any)
      : ("ACTIVE" as any);
    const activatedAt = sendInvite ? null : new Date();

    // Step 3a: Create TenantMembership as ORG_OWNER + isPrimaryAdmin
    const membership = await prisma.tenantMembership.upsert({
      where: { userId_tenantId_role: { userId, tenantId, role: "ORG_OWNER" } },
      create: {
        userId,
        tenantId,
        role: "ORG_OWNER",
        campusScope: "ALL",
        status: membershipStatus,
        isPrimaryAdmin: true,
        primaryProfileId: userId,
        invitedByUserId: actorId,
        invitedAt: new Date(),
        activatedAt,
      },
      update: {
        campusScope: "ALL",
        isPrimaryAdmin: true,
        primaryProfileId: userId,
        status: membershipStatus,
        invitedByUserId: actorId,
        invitedAt: new Date(),
        activatedAt,
      },
    });

    // Step 3b: Auto-grant dashboard permissions
    try {
      const granted = await grantAdminDashboardPerms({
        prisma,
        tenantId,
        profileId: userId,
      });
      if (granted > 0) {
        console.log(
          `[PlatformService] Auto-granted ${granted} dashboard permission(s) to ADMIN ${userId}`,
        );
      }
    } catch (permErr) {
      console.error(
        "[PlatformService] Failed to auto-grant dashboard permissions:",
        permErr,
      );
    }

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "CREATE_FIRST_ADMIN",
      targetType: "profile",
      targetId: userId,
      tenantId,
      after: { email: emailLower, full_name: fullName, role: "ADMIN" },
    });

    // Step 4: Send invite email
    let inviteSent = false;
    let inviteLink: string | undefined;

    if (sendInvite) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, slug: true },
        });

        if (!tenant) throw new Error("Tenant not found");

        const { code, tokenHash } = generateInviteOtp(6);

        const tokenId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.passwordResetToken.updateMany({
          where: {
            userId,
            membershipId: membership.id,
            purpose: "INVITE_SET_PASSWORD",
            usedAt: null,
          },
          data: { usedAt: new Date() },
        });

        await prisma.passwordResetToken.create({
          data: {
            id: tokenId,
            userId,
            tokenHash,
            purpose: "INVITE_SET_PASSWORD",
            tenantId,
            membershipId: membership.id,
            expiresAt,
            attemptCount: 0,
          },
        });

        const appBaseUrl = process.env.FRONTEND_URL || "https://app.vebgenix.com";
        inviteLink = `${appBaseUrl}/invite/accept?${new URLSearchParams({
          token: code,
          email: emailLower,
          uid: userId,
        }).toString()}`;

        if (process.env.NODE_ENV === "development") {
          console.log(
            "[PlatformService] DEV MODE: Invite link for",
            emailLower,
            ":",
            inviteLink,
          );
        }

        try {
          await publishEventBridgeEvent({
            detailType: "CognitoProvisionRequested",
            source: "vebgenix.platform",
            detail: {
              authUserId: userId,
              membershipId: membership.id,
              tenantId,
              email: emailLower,
              role: membership.role,
              kind: "TENANT_ADMIN",
            },
          });
        } catch (e) {
          console.error("[PlatformService] EventBridge publish failed:", e);
        }

        inviteSent = await emailService.sendInviteEmail(
          emailLower,
          inviteLink || "",
          tenant.name,
          `${appBaseUrl}/login`,
        );
      } catch (emailErr) {
        console.error("[PlatformService] Email sending failed:", emailErr);
      }
    }

    return {
      userId,
      alreadyExisted,
      inviteSent,
      ...(process.env.NODE_ENV === "development" && inviteLink
        ? { inviteLink }
        : {}),
    };
  }

  /**
   * Update tenant features
   */
  static async updateTenantFeatures(
    tenantId: string,
    features: Array<{ feature_key: string; enabled: boolean }>,
    actorId: string,
  ): Promise<void> {
    const normalizedFeatures = this.normalizeTenantFeatures(features);

    // Get current features for audit log
    const currentFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId },
    });

    // Upsert features
    // Prisma doesn't support bulk upsert nicely for composite keys without raw SQL or loops
    // We'll use a transaction with upserts
    await prisma.$transaction(
      normalizedFeatures.map((f) =>
        prisma.tenantFeature.upsert({
          where: {
            tenantId_featureKey: {
              tenantId,
              featureKey: f.feature_key,
            },
          },
          create: {
            tenantId,
            featureKey: f.feature_key,
            enabled: f.enabled,
          },
          update: {
            enabled: f.enabled,
          },
        }),
      ),
    );

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "UPDATE_TENANT_FEATURES",
      targetType: "tenant_features",
      targetId: tenantId,
      tenantId,
      before: { features: currentFeatures || [] },
      after: { features: normalizedFeatures },
    });
  }

  /**
   * Finalize tenant onboarding
   *
   * Validates:
   * - At least 1 campus
   * - At least 1 ADMIN user
   * - Required features enabled (DASHBOARD, ADMISSIONS)
   * - Tenant is active
   */
  static async finalizeTenantOnboarding(
    tenantId: string,
    actorId: string,
  ): Promise<{ ok: boolean; tenant: any }> {
    // Validate tenant exists and is active
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      const error: any = new Error("Tenant not found");
      error.statusCode = 404;
      throw error;
    }

    if (!tenant.isActive) {
      const error: any = new Error("Tenant is not active");
      error.statusCode = 400;
      throw error;
    }

    // Validate at least 1 campus
    const campusCount = await prisma.campus.count({
      where: { tenantId },
    });

    if (campusCount === 0) {
      const error: any = new Error("Tenant must have at least one campus");
      error.code = "NO_CAMPUSES";
      error.statusCode = 400;
      throw error;
    }

    // Validate at least 1 ADMIN user
    const adminCount = await prisma.profile.count({
      where: {
        tenantId,
        role: "ADMIN",
      },
    });

    if (adminCount === 0) {
      const error: any = new Error("Tenant must have at least one admin user");
      error.code = "NO_ADMINS";
      error.statusCode = 400;
      throw error;
    }

    // Validate required features
    const requiredFeatures = [...REQUIRED_ALWAYS_ON_FEATURES];
    const features = await prisma.tenantFeature.findMany({
      where: {
        tenantId,
        featureKey: { in: requiredFeatures },
        enabled: true,
      },
    });

    const enabledFeatureKeys = features.map((f) => f.featureKey);
    const missingFeatures = requiredFeatures.filter(
      (f) => !enabledFeatureKeys.includes(f),
    );

    if (missingFeatures.length > 0) {
      const error: any = new Error(
        `Required features not enabled: ${missingFeatures.join(", ")}`,
      );
      error.code = "MISSING_FEATURES";
      error.statusCode = 400;
      throw error;
    }

    const campusTypes = await prisma.campus.findMany({
      where: { tenantId },
      select: { campusType: true },
    });

    await this.ensureTenantSetupDefaults(
      tenantId,
      campusTypes.map((campus) => campus.campusType),
    );

    // Mark onboarding complete
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingComplete: true },
    });

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "FINALIZE_ONBOARDING",
      targetType: "tenant",
      targetId: tenantId,
      tenantId,
      before: { onboarding_complete: false },
      after: { onboarding_complete: true },
    });

    return {
      ok: true,
      tenant: updatedTenant,
    };
  }

  /**
   * List users for a tenant
   */
  static async listTenantUsers(tenantId: string): Promise<any[]> {
    const users = await prisma.profile.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        allCampusesAccess: true,
        tenantId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Map to snake_case to match previous Supabase output if needed, or keep camelCase
    // The frontend likely expects snake_case based on previous code usage
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.fullName,
      role: u.role,
      is_active: u.isActive,
      all_campuses_access: u.allCampusesAccess,
      tenant_id: u.tenantId,
      created_at: u.createdAt,
    }));
  }

  /**
   * Provision a user to a tenant
   * Creates or reuses auth user and adds to tenant
   */
  static async provisionTenantUser(
    tenantId: string,
    email: string,
    fullName: string,
    role: string,
    actorId: string,
    sendInvite: boolean = true,
  ): Promise<{ userId: string; alreadyExisted: boolean; inviteSent: boolean }> {
    // Normalize: trim whitespace then lowercase (Rule 3)
    const emailLower = email.trim().toLowerCase();

    // Validate email not belonging to a platform super admin
    const globalRole = await prisma.authUserGlobalRole.findFirst({
      where: {
        user: { email: emailLower },
        role: "PLATFORM_SUPER_ADMIN",
      },
    });

    if (globalRole) {
      const error: any = new Error("Email belongs to platform admin");
      error.code = "EMAIL_IS_PLATFORM";
      error.statusCode = 409;
      throw error;
    }

    // Check if email exists in AuthUser
    const authUser = await prisma.authUser.findUnique({
      where: { email: emailLower },
    });

    // Create or reuse auth user
    let userId: string;
    let alreadyExisted = false;

    if (authUser) {
      userId = authUser.id;
      alreadyExisted = true;
    } else {
      const newUser = await prisma.authUser.create({
        data: { email: emailLower, status: "ACTIVE" },
      });
      userId = newUser.id;
    }

    // Create or update profile
    // Note: Role is string here, need to cast to UserRole if possible, or just uppercase it
    // Assuming role is valid UserRole string
    await prisma.profile.upsert({
      where: { id: userId },
      create: {
        id: userId,
        tenantId,
        email: emailLower,
        fullName,
        role: role.toUpperCase() as any, // Cast to UserRole
        allCampusesAccess: false,
        isActive: true,
      },
      update: {
        tenantId,
        fullName,
        role: role.toUpperCase() as any,
        isActive: true,
      },
    });

    await prisma.userProfileLink.upsert({
      where: {
        userId_profileId: {
          userId,
          profileId: userId,
        },
      },
      create: {
        userId,
        profileId: userId,
        relationship: "SELF",
        isPrimary: true,
      },
      update: {
        isPrimary: true,
      },
    });

    // Map UserRole to MembershipRole
    const roleMap: Record<string, string> = {
      ADMIN: "ORG_ADMIN",
      TEACHER: "TEACHER",
      STAFF: "STAFF",
      ACCOUNTANT: "ACCOUNTANT",
      STUDENT: "STUDENT",
      PARENT: "PARENT",
    };
    const membershipRole = roleMap[role.toUpperCase()] || "STAFF";

    // Create TenantMembership
    const membership = await prisma.tenantMembership.upsert({
      where: {
        userId_tenantId_role: {
          userId,
          tenantId,
          role: membershipRole as any,
        },
      },
      create: {
        userId,
        tenantId,
        role: membershipRole as any,
        status: "INVITED" as any,
        isPrimaryAdmin: false,
        primaryProfileId: userId,
        invitedByUserId: actorId,
        invitedAt: new Date(),
        activatedAt: sendInvite ? null : new Date(),
      },
      update: {
        status: sendInvite ? ("INVITED" as any) : ("ACTIVE" as any),
        invitedByUserId: actorId,
        invitedAt: new Date(),
        activatedAt: sendInvite ? null : new Date(),
        primaryProfileId: userId,
      },
    });

    // Auto-grant dashboard permissions if role is ADMIN
    if (role.toUpperCase() === "ADMIN") {
      try {
        const granted = await grantAdminDashboardPerms({
          prisma,
          tenantId,
          profileId: userId,
        });
        if (granted > 0) {
          console.log(
            `[PlatformService] Auto-granted ${granted} dashboard permission(s) to ADMIN ${userId}`,
          );
        }
      } catch (permErr) {
        console.error(
          "[PlatformService] Failed to auto-grant dashboard permissions:",
          permErr,
        );
      }
    }

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "PROVISION_TENANT_USER",
      targetType: "profile",
      targetId: userId,
      tenantId,
      after: { email: emailLower, full_name: fullName, role },
    });

    // Generate real invite token + send email
    let inviteSent = false;
    let inviteLink: string | undefined;

    if (sendInvite) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });

        const { code, tokenHash } = generateInviteOtp(6);

        const tokenId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.passwordResetToken.updateMany({
          where: {
            userId,
            membershipId: membership.id,
            purpose: "INVITE_SET_PASSWORD",
            usedAt: null,
          },
          data: { usedAt: new Date() },
        });

        await prisma.passwordResetToken.create({
          data: {
            id: tokenId,
            userId,
            tokenHash,
            purpose: "INVITE_SET_PASSWORD",
            tenantId,
            membershipId: membership.id,
            expiresAt,
            attemptCount: 0,
          },
        });

        const appBaseUrl = process.env.FRONTEND_URL || "https://app.vebgenix.com";
        inviteLink = `${appBaseUrl}/invite/accept?${new URLSearchParams({
          token: code,
          email: emailLower,
          uid: userId,
        }).toString()}`;

        if (process.env.NODE_ENV === "development") {
          console.log(
            "[PlatformService] DEV MODE: Invite link for",
            emailLower,
            ":",
            inviteLink,
          );
        }

        try {
          await publishEventBridgeEvent({
            detailType: "CognitoProvisionRequested",
            source: "vebgenix.platform",
            detail: {
              authUserId: userId,
              membershipId: membership.id,
              tenantId,
              email: emailLower,
              role: membership.role,
              kind: "TENANT_USER",
            },
          });
        } catch (e) {
          console.error("[PlatformService] EventBridge publish failed:", e);
        }

        inviteSent = await emailService.sendInviteEmail(
          emailLower,
          inviteLink || "",
          tenant?.name || "Your Organization",
        );
      } catch (emailErr) {
        console.error("[PlatformService] Email sending failed:", emailErr);
      }
    }

    return {
      userId,
      alreadyExisted,
      inviteSent,
      ...(process.env.NODE_ENV === "development" && inviteLink
        ? { inviteLink }
        : {}),
    };
  }

  /**
   * Resend invite to a user
   */
  static async resendInvite(
    userId: string,
  ): Promise<{ inviteSent: boolean; inviteLink?: string }> {
    // Get user profile
    const profile = await prisma.profile.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!profile) {
      const error: any = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    const { code, tokenHash } = generateInviteOtp(6);

    // Get membership to link
    const membership = await prisma.tenantMembership.findFirst({
      where: { userId, tenantId: profile.tenantId },
    });

    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const invalidateWhere: any = {
      userId,
      purpose: "INVITE_SET_PASSWORD",
      usedAt: null,
    };
    if (membership?.id) invalidateWhere.membershipId = membership.id;

    await prisma.passwordResetToken.updateMany({
      where: invalidateWhere,
      data: { usedAt: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash,
        purpose: "INVITE_SET_PASSWORD",
        tenantId: profile.tenantId,
        membershipId: membership?.id ?? null,
        expiresAt,
        attemptCount: 0,
      },
    });

    const appBaseUrl = process.env.FRONTEND_URL || "https://app.vebgenix.com";
    const qs = new URLSearchParams({ token: code, uid: userId });
    if (profile.email) qs.set("email", profile.email);
    const inviteLink = `${appBaseUrl}/invite/accept?${qs.toString()}`;

    // In development, log the invite link
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[PlatformService] DEV MODE: Resend invite link for",
        profile.email,
        ":",
        inviteLink,
      );
    }

    // Send email
    const tenantName = profile.tenant?.name;
    try {
      await publishEventBridgeEvent({
        detailType: "CognitoProvisionRequested",
        source: "vebgenix.platform",
        detail: {
          authUserId: userId,
          membershipId: membership?.id ?? null,
          tenantId: profile.tenantId,
          email: profile.email,
          role: membership?.role ?? null,
          kind: "RESEND_INVITE",
        },
      });
    } catch (e) {
      console.error("[PlatformService] EventBridge publish failed:", e);
    }
    const inviteSent = await emailService.sendInviteEmail(
      profile.email || "",
      inviteLink,
      tenantName,
    );

    if (process.env.NODE_ENV === "development") {
      console.log("[PlatformService] Resend email sent status:", inviteSent);
    }

    return {
      inviteSent,
      ...(process.env.NODE_ENV === "development" ? { inviteLink } : {}),
    };
  }
}
