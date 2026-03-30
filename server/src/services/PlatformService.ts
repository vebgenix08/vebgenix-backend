import { AuditLogger } from "./AuditLogger";
import { emailService } from "./EmailService";
import prisma from "../infrastructure/prisma/client";
import { grantAdminDashboardPerms } from "../../scripts/grant-admin-dashboard-perms";
import crypto from "crypto";

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

export class PlatformService {
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

    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: slug || null,
        isActive: true,
        onboardingComplete: false,
      },
    });

    // Auto-enable all features for new tenants
    const allFeatures = [
      "DASHBOARD",
      "ADMISSIONS",
      "ACADEMICS",
      "ATTENDANCE",
      "FINANCE",
      "HOSTEL",
      "TRANSPORT",
    ];

    try {
      await prisma.tenantFeature.createMany({
        data: allFeatures.map((featureKey) => ({
          tenantId: tenant.id,
          featureKey,
          enabled: true,
        })),
      });
    } catch (featuresError) {
      console.error(
        "[PlatformService] Failed to create default features:",
        featuresError,
      );
    }

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: "CREATE_TENANT",
      targetType: "tenant",
      targetId: tenant.id,
      tenantId: tenant.id,
      after: { name, slug, features: "all_enabled" },
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
    const emailLower = email.toLowerCase();

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

    // Step 2: Create or reuse auth user
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
        allCampusesAccess: true,
        isActive: true,
      },
      update: {
        tenantId,
        fullName,
        role: "ADMIN",
        allCampusesAccess: true,
        isActive: true,
      },
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
        status: membershipStatus,
        isPrimaryAdmin: true,
        invitedByUserId: actorId,
        invitedAt: new Date(),
        activatedAt,
      },
      update: {},
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

        // Generate real invite token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

        // Store token in PasswordResetToken using raw SQL
        const tokenId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600000).toISOString();
        
        await prisma.$executeRawUnsafe(`
          INSERT INTO "PasswordResetToken" (
            "id", "userId", token_hash, "purpose", tenant_id, membership_id, expires_at, created_at, attempt_count
          ) VALUES (
            '${tokenId}', '${userId}', '${tokenHash}', 'INVITE_SET_PASSWORD', '${tenantId}', 
            '${membership.id}', '${expiresAt}', NOW(), 0
          )
        `);

        const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
        inviteLink = `${appBaseUrl}/invite/accept?token=${rawToken}`;

        if (process.env.NODE_ENV === "development") {
          console.log(
            "[PlatformService] DEV MODE: Invite link for",
            emailLower,
            ":",
            inviteLink,
          );
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
    // Get current features for audit log
    const currentFeatures = await prisma.tenantFeature.findMany({
      where: { tenantId },
    });

    // Upsert features
    // Prisma doesn't support bulk upsert nicely for composite keys without raw SQL or loops
    // We'll use a transaction with upserts
    await prisma.$transaction(
      features.map((f) =>
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
      after: { features },
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
    const requiredFeatures = ["DASHBOARD", "ADMISSIONS"];
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
    const emailLower = email.toLowerCase();

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
      },
      update: {},
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

        // Generate real invite token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

        // Store token in PasswordResetToken using raw SQL
        const tokenId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 3600000).toISOString();

        await prisma.$executeRawUnsafe(`
          INSERT INTO "PasswordResetToken" (
            "id", "userId", token_hash, "purpose", tenant_id, membership_id, expires_at, created_at, attempt_count
          ) VALUES (
            '${tokenId}', '${userId}', '${tokenHash}', 'INVITE_SET_PASSWORD', '${tenantId}', 
            '${membership.id}', '${expiresAt}', NOW(), 0
          )
        `);

        const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
        inviteLink = `${appBaseUrl}/invite/accept?token=${rawToken}`;

        if (process.env.NODE_ENV === "development") {
          console.log(
            "[PlatformService] DEV MODE: Invite link for",
            emailLower,
            ":",
            inviteLink,
          );
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

    // Generate real invite token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Get membership to link
    const membership = await prisma.tenantMembership.findFirst({
      where: { userId, tenantId: profile.tenantId },
    });

    // Store token in PasswordResetToken using raw SQL to bypass schema mismatch
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000).toISOString();

    await prisma.$executeRawUnsafe(`
       INSERT INTO "PasswordResetToken" (
         "id", "userId", token_hash, "purpose", tenant_id, membership_id, expires_at, created_at, attempt_count
       ) VALUES (
         '${tokenId}', '${userId}', '${tokenHash}', 'INVITE_SET_PASSWORD', '${profile.tenantId}', 
         ${membership?.id ? `'${membership.id}'` : "NULL"}, 
         '${expiresAt}', NOW(), 0
       )
     `);

    const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:5173";
    const inviteLink = `${appBaseUrl}/invite/accept?token=${rawToken}`;

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
