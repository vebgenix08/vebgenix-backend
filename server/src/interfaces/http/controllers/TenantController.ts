import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import { CampusType } from "@prisma/client";

/**
 * GET /api/tenant/me
 * Returns tenant info, user profile, accessible campuses, and enabled features
 */
export async function getTenantMe(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;

    if (!tenant || !user) {
      res.status(500).json({
        error: {
          code: "MIDDLEWARE_ERROR",
          message: "Tenant or user not resolved",
        },
      });
      return;
    }

    // 1. Get campuses user can access
    let campusesUserCanAccess: any[] = [];

    // Cast user to any for compatibility
    const userAny = user as any;
    
    // ORG_OWNER and ORG_ADMIN always have full campus visibility
    const tenantRole = (req as any).auth?.tenant_role ?? "";
    const isOrgAdmin = tenantRole === "ORG_OWNER" || tenantRole === "ORG_ADMIN";
    const hasAllAccess = isOrgAdmin || userAny.allCampusesAccess === true;

    // Use tenant ID from request context (which comes from resolveTenant)
    const contextTenantId = tenant.tenantId;

    if (hasAllAccess) {
      // User has access to all campuses in the tenant
      const allCampuses = await prisma.campus.findMany({
        where: {
          tenantId: contextTenantId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          campusType: true,
          isActive: true,
        },
      });
      campusesUserCanAccess = allCampuses || [];
    } else {
      // Get explicit campus access
      const accessRecords = await prisma.userCampusAccess.findMany({
        where: {
          profileId: user.id,
          tenantId: contextTenantId,
          campus: {
            isActive: true,
          },
        },
        include: {
          campus: {
            select: {
              id: true,
              name: true,
              campusType: true,
              isActive: true,
            },
          },
        },
      });

      campusesUserCanAccess = (accessRecords || []).map(
        (record: any) => record.campus,
      );
    }

    // 2. Get enabled features for tenant
    const features = await prisma.tenantFeature.findMany({
      where: {
        tenantId: contextTenantId,
        enabled: true,
      },
      select: {
        featureKey: true,
      },
    });

    const featuresList = (features || []).map((f: any) => ({
      feature_key: f.featureKey,
      enabled: true,
    }));

    const campuses = (campusesUserCanAccess || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      campus_type: c.campusType,
      is_active: c.isActive,
    }));

    res.json({
      tenant: { id: contextTenantId, name: tenant.name, slug: tenant.slug },
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        all_campuses_access: userAny.allCampusesAccess,
        allCampusesAccess: userAny.allCampusesAccess,
      },
      campuses,
      campusesUserCanAccess: campuses,
      features: featuresList,
      featuresEnabled: featuresList.map((f: any) => f.feature_key),
    });
    return; // Ensure return
  } catch (error) {
    console.error("Get tenant/me error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch tenant information",
      },
    });
    return; // Ensure return
  }
}

/**
 * GET /api/tenant/campuses
 * ADMIN only - Returns all campuses for tenant
 */
export async function getCampuses(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      res.status(500).json({
        error: {
          code: "MIDDLEWARE_ERROR",
          message: "Tenant not resolved",
        },
      });
      return;
    }

    const campuses = await prisma.campus.findMany({
      where: {
        tenantId: tenant.tenantId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json({ campuses: campuses || [] });
  } catch (error) {
    console.error("Get campuses error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch campuses",
      },
    });
  }
}

/**
 * POST /api/tenant/campuses
 * ADMIN only - Create new campus
 */
export async function createCampus(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      res.status(500).json({
        error: {
          code: "MIDDLEWARE_ERROR",
          message: "Tenant not resolved",
        },
      });
      return;
    }

    const { name, campus_type } = req.body;

    if (!name || !campus_type) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "name and campus_type are required",
        },
      });
      return;
    }

    if (!["SCHOOL", "PU"].includes(campus_type)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "campus_type must be SCHOOL or PU",
        },
      });
      return;
    }

    // Check uniqueness
    const existing = await prisma.campus.findUnique({
      where: {
        tenantId_name: {
          tenantId: tenant.tenantId,
          name,
        },
      },
    });

    if (existing) {
      res.status(409).json({
        error: {
          code: "CAMPUS_EXISTS",
          message: "A campus with this name already exists",
        },
      });
      return;
    }

    const campus = await prisma.campus.create({
      data: {
        tenantId: tenant.tenantId,
        name,
        campusType: campus_type as CampusType,
        isActive: true,
      },
    });

    res.status(201).json({ campus });
  } catch (error) {
    console.error("Create campus error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to create campus",
      },
    });
  }
}

/**
 * PATCH /api/tenant/campuses/:campusId
 * ADMIN only - Update campus details
 */
export async function updateCampus(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      res.status(500).json({ error: { code: "MIDDLEWARE_ERROR", message: "Tenant not resolved" } });
      return;
    }

    const { campusId } = req.params;
    const { name, campus_type, isActive } = req.body;

    // Verify campus belongs to tenant
    const existing = await prisma.campus.findUnique({ where: { id: campusId } });
    if (!existing || existing.tenantId !== tenant.tenantId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Campus not found" } });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (campus_type !== undefined) updateData.campusType = campus_type as CampusType;
    if (isActive !== undefined) updateData.isActive = isActive;

    const campus = await prisma.campus.update({
      where: { id: campusId },
      data: updateData,
    });

    res.json({ campus });
  } catch (error) {
    console.error("Update campus error:", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update campus" } });
  }
}

/**
 * PATCH /api/tenant/features
 * ADMIN only - Update feature flags
 */
export async function updateFeatures(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      res.status(500).json({
        error: {
          code: "MIDDLEWARE_ERROR",
          message: "Tenant not resolved",
        },
      });
      return;
    }

    const features = req.body;

    if (!Array.isArray(features)) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body must be an array of { feature_key, enabled }",
        },
      });
      return;
    }

    // Validate each feature
    for (const feature of features) {
      if (!feature.feature_key || typeof feature.enabled !== "boolean") {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Each feature must have feature_key (string) and enabled (boolean)",
          },
        });
        return;
      }
    }

    // Upsert features transactionally
    const ops = features.map((f: any) =>
      prisma.tenantFeature.upsert({
        where: {
          tenantId_featureKey: {
            tenantId: tenant.tenantId,
            featureKey: f.feature_key,
          },
        },
        update: {
          enabled: f.enabled,
        },
        create: {
          tenantId: tenant.tenantId,
          featureKey: f.feature_key,
          enabled: f.enabled,
        },
      }),
    );

    const data = await prisma.$transaction(ops);

    res.json({ features: data || [] });
  } catch (error) {
    console.error("Update features error:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to update features",
      },
    });
  }
}
