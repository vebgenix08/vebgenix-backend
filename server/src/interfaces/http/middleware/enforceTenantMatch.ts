import { Request, Response, NextFunction } from "express";

/**
 * enforceTenantMatch — Step 3 of auth chain
 *
 * Requires: verifyJwt (req.auth) + resolveTenant (req.tenant) to have run first.
 *
 * Rule (strict — no super-admin bypass):
 *   req.auth.tenantId === req.tenant.tenantId
 *
 * Platform super admins MUST use a tenant-scoped token (minted via
 * /api/platform/impersonate or /api/platform/switch-tenant) before
 * accessing any /api/tenants/:tenantId/* route.
 */
export const enforceTenantMatch = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = (req as any).auth;
  const tenant = (req as any).tenant;

  if (!auth) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  }

  if (!tenant) {
    return res.status(500).json({
      error: {
        code: "MIDDLEWARE_ERROR",
        message: "Tenant context not resolved — resolveTenant must run first",
      },
    });
  }

  // Strict match: token's tenant_id must equal the resolved tenant's id.
  // No bypass for super admins — they must switch to a tenant-scoped token first.
  if (!auth.tenantId) {
    return res.status(403).json({
      error: {
        code: "TENANT_TOKEN_REQUIRED",
        message:
          "A tenant-scoped token is required. Use /api/platform/impersonate to obtain one.",
      },
    });
  }

  if (auth.tenantId !== tenant.tenantId) {
    return res.status(403).json({
      error: {
        code: "TENANT_MISMATCH",
        message: "Token tenant_id does not match the requested tenant",
      },
    });
  }

  return next();
};
