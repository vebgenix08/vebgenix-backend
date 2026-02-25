/**
 * Phase 3 — requirePermission middleware
 *
 * Factory that returns an Express middleware enforcing a named permission key.
 * Checks in order:
 *   1. tenantWideKeys (campusId = null grants) — always valid
 *   2. campusKeys[campusId] — valid for campus-scoped grants
 *
 * Campus membership is also re-verified:
 *   user must have allCampusesAccess OR campus-specific access via UserCampusAccess.
 *   (requireCampusContext already validated this, so req.campus is trusted here)
 *
 * IMPORTANT: This middleware is ADDED ALONGSIDE requireRole, not replacing it.
 * requireRole remains the primary gate until full rollout.
 *
 * On failure: 403 { code: "PERMISSION_DENIED", missing: key }
 */

import { Request, Response, NextFunction } from 'express';

export function requirePermission(permissionKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth: any = (req as any).auth;

    // requireAuth must run before this middleware
    if (!auth) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication context missing. Ensure requireAuth runs first.',
        },
      });
      return;
    }

    const tenantWideKeys: Set<string> = auth.tenantWideKeys ?? new Set();
    const campusKeys: Map<string, Set<string>> = auth.campusKeys ?? new Map();
    const campusId: string | undefined = (req as any).campus?.campusId;

    // 1. Tenant-wide grant (campusId = null) — allows access regardless of campus
    if (tenantWideKeys.has(permissionKey)) {
      return next();
    }

    // 2. Campus-scoped grant — only valid if we have a campus context
    if (campusId && campusKeys.has(campusId)) {
      const campusSet = campusKeys.get(campusId)!;
      if (campusSet.has(permissionKey)) {
        // Campus membership already verified by requireCampusContext middleware.
        // req.campus is set only after that verification passes.
        return next();
      }
    }

    // 3. Permission not found — deny
    res.status(403).json({
      error: {
        code: 'PERMISSION_DENIED',
        message: `Missing required permission: "${permissionKey}". Contact your administrator.`,
        missing: permissionKey,
      },
    });
    return;
  };
}
