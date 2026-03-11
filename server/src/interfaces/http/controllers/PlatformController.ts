import { Request, Response } from "express";
import { PlatformService } from "../../../services/PlatformService";
import prisma from "../../../infrastructure/prisma/client";

/**
 * Platform Controller
 * Handles all platform admin operations
 *
 * All endpoints require requireSuperAdmin middleware
 * All mutations write to platform_audit_logs
 */

export class PlatformController {
  /**
   * GET /api/platform/tenants
   * List all tenants with primary Admin details
   */
  static async listTenants(_req: Request, res: Response) {
    try {
      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          campuses: {
            select: { id: true },
          },
        },
      });

      // Get primary Admin details separately
      const tenantsWithDetails = await Promise.all(
        (tenants || []).map(async (tenant: any) => {
          // Get primary Admin email
          let first_admin_email = null;
          let first_admin_id = null;
          const membership = await prisma.tenantMembership.findFirst({
            where: { tenantId: tenant.id, isPrimaryAdmin: true },
            include: { user: { select: { email: true } } },
          });

          if (membership && membership.user) {
            first_admin_email = membership.user.email;
            first_admin_id = membership.userId;
          }

          return {
            ...tenant,
            is_active: tenant.isActive,
            onboarding_complete: tenant.onboardingComplete,
            subdomain: tenant.slug,
            first_admin_email,
            first_admin_id,
          };
        }),
      );

      return res.json({ data: tenantsWithDetails });
    } catch (error: any) {
      console.error("[PlatformController] listTenants error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants
   * Create a new tenant
   */
  static async createTenant(req: Request, res: Response) {
    try {
      const { name, slug, subdomain } = req.body;
      const tenantSlug = slug || subdomain;
      const actorId = (req as any).platformUser.id;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const tenant = await PlatformService.createTenant(
        name,
        tenantSlug || null,
        actorId,
      );

      return res.status(201).json({
        data: {
          ...tenant,
          subdomain: tenant.slug,
        },
      });
    } catch (error: any) {
      console.error("[PlatformController] createTenant error:", error);

      if (error.code === "SLUG_EXISTS") {
        return res.status(409).json({ error: error.message, code: error.code });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/platform/tenants/:tenantId
   * Update tenant
   */
  static async updateTenant(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { name, is_active } = req.body;
      const actorId = (req as any).platformUser.id;

      // Get current state for audit
      const before = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!before) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      // Update
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.isActive = is_active;

      const tenant = await prisma.tenant.update({
        where: { id: tenantId },
        data: updates,
      });

      // Log audit
      const { AuditLogger } = await import("../../../services/AuditLogger");
      await AuditLogger.logAction({
        actorId,
        action: "UPDATE_TENANT",
        targetType: "tenant",
        targetId: tenantId,
        tenantId,
        before,
        after: tenant,
      });

      return res.json({
        data: {
          ...tenant,
          is_active: tenant.isActive,
          onboarding_complete: tenant.onboardingComplete,
          subdomain: tenant.slug,
        },
      });
    } catch (error: any) {
      console.error("[PlatformController] updateTenant error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/tenants/:tenantId/campuses
   * List campuses for a tenant
   */
  static async listCampuses(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;

      const campuses = await prisma.campus.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
      });

      return res.json({ data: campuses });
    } catch (error: any) {
      console.error("[PlatformController] listCampuses error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/campuses
   * Create a campus for a tenant
   */
  static async createCampus(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { name, campus_type } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!name || !campus_type) {
        return res
          .status(400)
          .json({ error: "Name and campus_type are required" });
      }

      if (!["SCHOOL", "PU"].includes(campus_type)) {
        return res
          .status(400)
          .json({ error: "campus_type must be SCHOOL or PU" });
      }

      const campus = await PlatformService.createCampus(
        tenantId,
        name,
        campus_type,
        actorId,
      );

      return res.status(201).json({ data: campus });
    } catch (error: any) {
      console.error("[PlatformController] createCampus error:", error);

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/platform/campuses/:campusId
   * Update a campus
   */
  static async updateCampus(req: Request, res: Response) {
    try {
      const { campusId } = req.params;
      const { name, is_active } = req.body;
      const actorId = (req as any).platformUser.id;

      // Get current state
      const before = await prisma.campus.findUnique({
        where: { id: campusId },
      });

      if (!before) {
        return res.status(404).json({ error: "Campus not found" });
      }

      // Update
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.isActive = is_active;

      const campus = await prisma.campus.update({
        where: { id: campusId },
        data: updates,
      });

      // Log audit
      const { AuditLogger } = await import("../../../services/AuditLogger");
      await AuditLogger.logAction({
        actorId,
        action: "UPDATE_CAMPUS",
        targetType: "campus",
        targetId: campusId,
        tenantId: campus.tenantId,
        campusId,
        before,
        after: campus,
      });

      return res.json({ data: campus });
    } catch (error: any) {
      console.error("[PlatformController] updateCampus error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/first-admin
   * Create the primary Admin for a tenant
   */
  static async createFirstAdmin(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { email, full_name, sendInvite = true } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!email || !full_name) {
        return res
          .status(400)
          .json({ error: "Email and full_name are required" });
      }

      const result = await PlatformService.createFirstAdmin(
        tenantId,
        email,
        full_name,
        actorId,
        sendInvite,
      );

      return res.status(201).json({ data: result });
    } catch (error: any) {
      console.error("[PlatformController] createFirstAdmin error:", error);

      if (error.code === "EMAIL_IS_PLATFORM" || error.code === "EMAIL_IN_USE") {
        return res.status(409).json({ error: error.message, code: error.code });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/tenants/:tenantId/features
   * List features for a tenant
   */
  static async listFeatures(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;

      const features = await prisma.tenantFeature.findMany({
        where: { tenantId },
      });

      return res.json({ data: features || [] });
    } catch (error: any) {
      console.error("[PlatformController] listFeatures error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/platform/tenants/:tenantId/features
   * Update tenant features
   */
  static async updateFeatures(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const features = req.body;
      const actorId = (req as any).platformUser.id;

      if (!Array.isArray(features)) {
        return res.status(400).json({ error: "Features must be an array" });
      }

      await PlatformService.updateTenantFeatures(tenantId, features, actorId);

      // Return updated features
      const updatedFeatures = await prisma.tenantFeature.findMany({
        where: { tenantId },
      });

      return res.json({ data: updatedFeatures });
    } catch (error: any) {
      console.error("[PlatformController] updateFeatures error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/finalize
   * Finalize tenant onboarding
   */
  static async finalizeOnboarding(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const actorId = (req as any).platformUser.id;

      const result = await PlatformService.finalizeTenantOnboarding(
        tenantId,
        actorId,
      );

      return res.json({ data: result });
    } catch (error: any) {
      console.error("[PlatformController] finalizeOnboarding error:", error);

      if (
        error.code === "NO_CAMPUSES" ||
        error.code === "NO_ADMINS" ||
        error.code === "MISSING_FEATURES"
      ) {
        return res.status(400).json({ error: error.message, code: error.code });
      }

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/users/:userId/resend-invite
   * Resend invite to a user
   */
  static async resendInvite(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const result = await PlatformService.resendInvite(userId);

      return res.json({ data: result });
    } catch (error: any) {
      console.error("[PlatformController] resendInvite error:", error);

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/me
   * Get current platform user info
   */
  static async getMe(req: Request, res: Response) {
    try {
      const platformUser = (req as any).platformUser;
      return res.json({ data: platformUser });
    } catch (error: any) {
      console.error("[PlatformController] getMe error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/finalize
   * Finalize tenant onboarding
   */
  static async finalizeTenant(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const actorId = (req as any).platformUser.id;

      const result = await PlatformService.finalizeTenantOnboarding(
        tenantId,
        actorId,
      );
      return res.json({ data: result });
    } catch (error: any) {
      console.error("[PlatformController] finalizeTenant error:", error);

      if (
        error.code === "NO_CAMPUSES" ||
        error.code === "NO_ADMINS" ||
        error.code === "MISSING_FEATURES"
      ) {
        return res.status(400).json({ error: error.message, code: error.code });
      }

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/tenants/:tenantId/users
   * List users for a tenant
   */
  static async listTenantUsers(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;

      const users = await PlatformService.listTenantUsers(tenantId);
      return res.json({ data: users });
    } catch (error: any) {
      console.error("[PlatformController] listTenantUsers error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/users
   * Provision a user to a tenant
   */
  static async provisionTenantUser(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { email, full_name, role, sendInvite = true } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!email || !full_name || !role) {
        return res
          .status(400)
          .json({ error: "Email, full_name, and role are required" });
      }

      const result = await PlatformService.provisionTenantUser(
        tenantId,
        email,
        full_name,
        role,
        actorId,
        sendInvite,
      );

      return res.status(201).json({ data: result });
    } catch (error: any) {
      console.error("[PlatformController] provisionTenantUser error:", error);

      if (error.code === "EMAIL_IS_PLATFORM" || error.code === "EMAIL_IN_USE") {
        return res.status(409).json({ error: error.message, code: error.code });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/impersonate
   * Create an impersonation session for a user
   */
  static async impersonate(req: Request, res: Response) {
    try {
      const { tenantId, userId } = req.body;

      if (!tenantId || !userId) {
        return res
          .status(400)
          .json({ error: "tenantId and userId are required" });
      }

      // Verify user exists in this tenant
      const profile = await prisma.profile.findUnique({
        where: { id: userId },
        select: { id: true, email: true, tenantId: true },
      });

      if (!profile || profile.tenantId !== tenantId) {
        return res.status(404).json({ error: "User not found in this tenant" });
      }

      // TODO: Replace Supabase Magic Link with a local token or other mechanism if needed
      // For now, return a placeholder or "Not Implemented"
      const impersonationUrl = `http://localhost:5173/auth/callback?token=mock-impersonation-token&type=magiclink`;

      return res.json({ data: { impersonation_url: impersonationUrl } });
    } catch (error: any) {
      console.error("[PlatformController] impersonate error:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}
