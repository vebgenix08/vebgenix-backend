import { Request, Response, NextFunction } from 'express';
import { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';
import { TenantFeature } from '@vebgenix/db';

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.ctx as AuthContext;
    if (!ctx) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }
    const missing = permissions.filter(p => !ctx.permissions.has(p) && !ctx.isPlatformAdmin);
    if (missing.length > 0) {
      res.status(403).json({ code: 'FORBIDDEN', message: `Missing permissions: ${missing.join(', ')}` });
      return;
    }
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.ctx as AuthContext;
    if (!ctx?.membership) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'No tenant context' });
      return;
    }
    const userRoles = ctx.membership.roles.map(r => r.roleName);
    const hasRole = roles.some(r => userRoles.includes(r));
    if (!hasRole && !ctx.isPlatformAdmin) {
      res.status(403).json({ code: 'FORBIDDEN', message: `Required roles: ${roles.join(', ')}` });
      return;
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.ctx as AuthContext;
  if (!ctx?.isPlatformAdmin) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'Super admin access required' });
    return;
  }
  next();
}

export function requireFeatureAccess(feature: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ctx = req.ctx as AuthContext | undefined;
    if (!ctx) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }
    // Platform admins bypass all feature flags
    if (ctx.isPlatformAdmin) { next(); return; }

    const tenantId = ctx.membership?.tenantId;
    if (!tenantId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'No tenant context for feature check' });
      return;
    }

    TenantFeature.findOne({ tenantId }).lean().then((doc) => {
      const features = (doc as Record<string, unknown> | null)?.features as Record<string, boolean> | undefined;
      const enabled  = features?.[feature] ?? false;
      if (!enabled) {
        res.status(403).json({ code: 'FEATURE_DISABLED', message: `Feature "${feature}" is not enabled for this tenant` });
        return;
      }
      next();
    }).catch((err: unknown) => {
      console.error('[requireFeatureAccess] DB error:', err);
      res.status(500).json({ code: 'INTERNAL', message: 'Feature check failed' });
    });
  };
}

/**
 * Use-case level feature guard — throws AppError if feature is disabled.
 * Call with `await requireFeatureEnabled(ctx, 'admissions')` inside use-cases.
 */
export async function requireFeatureEnabled(ctx: AuthContext, feature: string): Promise<void> {
  if (ctx.isPlatformAdmin) return;
  const tenantId = ctx.membership?.tenantId;
  if (!tenantId) throw new AppError('FORBIDDEN', 'No tenant context for feature check');
  const doc = await TenantFeature.findOne({ tenantId }).lean();
  const features = (doc as Record<string, unknown> | null)?.features as Record<string, boolean> | undefined;
  const enabled  = features?.[feature] ?? false;
  if (!enabled) {
    throw new AppError('FORBIDDEN', `Feature "${feature}" is not enabled for this tenant`);
  }
}

/** Utility: throw AppError if ctx is missing a permission (for use inside use-cases) */
export function authorize(ctx: AuthContext, ...permissions: string[]): void {
  if (ctx.isPlatformAdmin) return;
  const missing = permissions.filter(p => !ctx.permissions.has(p));
  if (missing.length > 0) {
    throw new AppError('FORBIDDEN', `Missing permissions: ${missing.join(', ')}`);
  }
}
