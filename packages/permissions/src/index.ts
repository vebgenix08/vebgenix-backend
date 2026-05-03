import { Request, Response, NextFunction } from 'express';
import { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';

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
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // TODO: query TenantFeature model for feature flag
    // For now, pass through — feature flag check to be implemented per-service
    void feature;
    next();
  };
}

/** Utility: throw AppError if ctx is missing a permission (for use inside use-cases) */
export function authorize(ctx: AuthContext, ...permissions: string[]): void {
  if (ctx.isPlatformAdmin) return;
  const missing = permissions.filter(p => !ctx.permissions.has(p));
  if (missing.length > 0) {
    throw new AppError('FORBIDDEN', `Missing permissions: ${missing.join(', ')}`);
  }
}
