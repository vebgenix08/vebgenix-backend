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
  static async listAuditLogs(req: Request, res: Response) {
    try {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const skip = (page - 1) * limit;

      const [total, logs] = await Promise.all([
        prisma.platformAuditLog.count(),
        prisma.platformAuditLog.findMany({
          orderBy: [{ at: "desc" }, { id: "desc" }],
          skip,
          take: limit,
        }),
      ]);

      const actorIds = Array.from(
        new Set(logs.map((log) => log.actorId).filter(Boolean)),
      );

      const actors = actorIds.length
        ? await prisma.authUser.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, email: true },
          })
        : [];

      const actorEmailById = new Map(actors.map((actor) => [actor.id, actor.email]));

      const data = logs.map((log) => ({
        id: log.id,
        at: log.at,
        actorId: log.actorId,
        actorEmail: actorEmailById.get(log.actorId) ?? null,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        meta: log.meta,
        metaSummary:
          typeof log.meta === "string"
            ? log.meta
            : log.meta
              ? JSON.stringify(log.meta)
              : null,
      }));

      return res.json({
        data,
        pagination: {
          total,
          page,
          limit,
          pages: Math.max(Math.ceil(total / limit), 1),
        },
      });
    } catch (error: any) {
      console.error("[PlatformController] listAuditLogs error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  static async getAuditLog(req: Request, res: Response) {
    try {
      const { logId } = req.params;
      const log = await prisma.platformAuditLog.findUnique({
        where: { id: logId },
      });

      if (!log) {
        return res.status(404).json({ error: "Audit log not found" });
      }

      const actor = await prisma.authUser.findUnique({
        where: { id: log.actorId },
        select: { id: true, email: true },
      });

      return res.json({
        data: {
          id: log.id,
          at: log.at,
          actorId: log.actorId,
          actorEmail: actor?.email ?? null,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          meta: log.meta,
          metaSummary:
            typeof log.meta === "string"
              ? log.meta
              : log.meta
                ? JSON.stringify(log.meta)
                : null,
        },
      });
    } catch (error: any) {
      console.error("[PlatformController] getAuditLog error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

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
      const { name, slug, subdomain, features } = req.body;
      const tenantSlug = slug || subdomain;
      const actorId = (req as any).platformUser.id;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const tenant = await PlatformService.createTenant(
        name,
        tenantSlug || null,
        actorId,
        Array.isArray(features) ? features : undefined,
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

      if (!["SCHOOL", "PU", "DEGREE"].includes(campus_type)) {
        return res
          .status(400)
          .json({ error: "campus_type must be SCHOOL, PU, or DEGREE" });
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

      if (
        error.code === "EMAIL_IS_PLATFORM" ||
        error.code === "EMAIL_IN_USE" ||
        error.code === "PRIMARY_ADMIN_EMAIL_ALREADY_EXISTS"
      ) {
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
      await PlatformService.ensureRequiredTenantFeatures(tenantId);

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
      await PlatformService.ensureRequiredTenantFeatures(tenantId);

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
   * GET /api/platform/audit-logs
   * List platform audit logs
   */
  static async listAuditLogs(req: Request, res: Response) {
    try {
      const limit = Math.min(
        Math.max(parseInt((req.query.limit as string) || "25", 10), 1),
        100,
      );
      const page = Math.max(parseInt((req.query.page as string) || "1", 10), 1);
      const skip = (page - 1) * limit;

      const where: any = {};
      if (req.query.actor_id) where.actorId = String(req.query.actor_id);
      if (req.query.action) where.action = String(req.query.action);
      if (req.query.target_type) where.targetType = String(req.query.target_type);
      if (req.query.target_id) where.targetId = String(req.query.target_id);

      if (req.query.start_date || req.query.end_date) {
        where.at = {};
        if (req.query.start_date) where.at.gte = new Date(String(req.query.start_date));
        if (req.query.end_date) where.at.lte = new Date(String(req.query.end_date));
      }

      const [logs, total] = await prisma.$transaction([
        prisma.platformAuditLog.findMany({
          where,
          orderBy: [{ at: "desc" }, { id: "desc" }],
          skip,
          take: limit,
        }),
        prisma.platformAuditLog.count({ where }),
      ]);

      const actorIds = Array.from(
        new Set(logs.map((log) => log.actorId).filter(Boolean)),
      );
      const actors =
        actorIds.length > 0
          ? await prisma.authUser.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, email: true },
            })
          : [];
      const actorMap = new Map(actors.map((actor) => [actor.id, actor.email]));

      const items = logs.map((log) => {
        const meta = (log.meta ?? {}) as Record<string, any>;
        const after = (meta.after ?? {}) as Record<string, any>;
        const before = (meta.before ?? {}) as Record<string, any>;
        const label =
          after.name ||
          after.email ||
          after.feature_key ||
          before.name ||
          before.email ||
          before.feature_key ||
          null;

        return {
          id: log.id,
          at: log.at,
          actorId: log.actorId,
          actorEmail: actorMap.get(log.actorId) ?? null,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          meta: log.meta,
          metaSummary: label ? `${log.action} ${label}` : log.action,
        };
      });

      return res.json({
        data: items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("[PlatformController] listAuditLogs error:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/audit-logs/:logId
   * Get platform audit log detail
   */
  static async getAuditLog(req: Request, res: Response) {
    try {
      const { logId } = req.params;
      const log = await prisma.platformAuditLog.findUnique({
        where: { id: logId },
      });

      if (!log) {
        return res.status(404).json({ error: "Audit log not found" });
      }

      const actor = await prisma.authUser.findUnique({
        where: { id: log.actorId },
        select: { id: true, email: true },
      });

      return res.json({
        data: {
          id: log.id,
          at: log.at,
          actorId: log.actorId,
          actorEmail: actor?.email ?? null,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          meta: log.meta,
        },
      });
    } catch (error: any) {
      console.error("[PlatformController] getAuditLog error:", error);
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
      const frontendBase = process.env.FRONTEND_URL || "https://d18w0fdwt58ts4.cloudfront.net";
      const impersonationUrl = `${frontendBase}/auth/callback?token=mock-impersonation-token&type=magiclink`;

      return res.json({ data: { impersonation_url: impersonationUrl } });
    } catch (error: any) {
      console.error("[PlatformController] impersonate error:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}
