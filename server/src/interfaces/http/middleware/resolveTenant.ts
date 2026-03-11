import { Request, Response, NextFunction } from "express";
import prisma from "../../../infrastructure/prisma/client";

/**
 * Tenant Resolution Middleware
 *
 * Authority order (UUID only — NO hostname, NO slug, NO subdomain):
 *  1. req.params.tenantId  — from route /api/tenants/:tenantId/*
 *  2. req.auth.tenantId    — from JWT claim (for non-parameterised tenant routes)
 *  3. req.headers['x-tenant-id'] — dev-only header fallback
 *
 * Slug is NEVER used here. Slug is display/search only.
 */
export const resolveTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // 1. URL param (highest priority — explicit routing)
    let tenantId: string | null = (req.params as any).tenantId ?? null;

    // 2. JWT claim fallback (for routes that use token without URL param)
    if (!tenantId) {
      tenantId = (req as any).auth?.tenantId ?? null;
    }

    // 3. Dev-only header fallback
    if (!tenantId && process.env.NODE_ENV === "development") {
      tenantId = (req.headers["x-tenant-id"] as string) ?? null;
    }

    if (!tenantId) {
      return res.status(400).json({
        code: "TENANT_REQUIRED",
        message: "No tenantId found in URL params, JWT claim, or dev header.",
      });
    }

    // 4. Lookup tenant by ID (never by slug)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        onboardingComplete: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({
        code: "TENANT_NOT_FOUND",
        message: `Tenant '${tenantId}' not found`,
      });
    }

    // 5. Validate active
    if (!tenant.isActive) {
      return res.status(404).json({
        code: "TENANT_NOT_FOUND",
        message: "Tenant not found or inactive",
      });
    }

    // 6. Attach — slug is metadata only
    (req as any).tenant = {
      tenantId: tenant.id,
      id: tenant.id, // convenience alias
      slug: tenant.slug, // display only
      name: tenant.name,
    };

    return next();
  } catch (err: any) {
    console.error("[resolveTenant] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
