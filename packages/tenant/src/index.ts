import type { Request, Response, NextFunction } from 'express';
import { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';

/** Ensures tenant context exists on the authenticated request */
export function requireTenantContext(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.ctx as AuthContext;
  if (!ctx?.membership?.tenantId) {
    res.status(400).json({ code: 'BAD_REQUEST', message: 'Tenant context required' });
    return;
  }
  next();
}

/** Ensures the :tenantId URL param matches the authenticated user's tenant */
export function enforceTenantMatch(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.ctx as AuthContext;
  const urlTenantId = req.params.tenantId;
  if (!urlTenantId) { next(); return; }
  if (ctx.isPlatformAdmin) { next(); return; }
  if (!ctx.membership || ctx.membership.tenantId !== urlTenantId) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'Tenant mismatch' });
    return;
  }
  next();
}

/** Ensures campus context is provided for campus-scoped operations */
export function requireCampusContext(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.ctx as AuthContext;
  const campusId = req.headers['x-campus-id'] as string ?? req.query.campusId as string;
  if (!campusId) {
    res.status(400).json({ code: 'BAD_REQUEST', message: 'Campus context required (x-campus-id header)' });
    return;
  }
  if (!ctx.isPlatformAdmin && !ctx.membership?.isAllCampuses && !ctx.allowedCampusIds.has(campusId)) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'No access to this campus' });
    return;
  }
  next();
}

/** Utility: get tenantId from ctx or throw */
export function getTenantId(ctx: AuthContext): string {
  if (!ctx.membership?.tenantId) {
    throw new AppError('BAD_REQUEST', 'Tenant context required');
  }
  return ctx.membership.tenantId;
}
