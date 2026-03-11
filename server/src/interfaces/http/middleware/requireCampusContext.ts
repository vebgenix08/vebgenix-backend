import { Request, Response, NextFunction } from 'express';
import prisma from '../../../infrastructure/prisma/client';

export interface CampusInfo {
  campusId: string;
  campusType: 'SCHOOL' | 'PU' | 'DEGREE';
  name: string;
}

/**
 * Middleware to validate campus access.
 * Requires: resolveTenant and requireAuth to be run first.
 *
 * Bypass: ORG_OWNER and ORG_ADMIN always have access to all campuses.
 */
export const requireCampusContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenant?.tenantId;
    const campusId = req.header('X-Campus-Id');

    if (!tenantId) {
      return res.status(500).json({ code: 'TENANT_CONTEXT_MISSING', message: 'Tenant context missing' });
    }

    if (!campusId) {
      return res.status(400).json({ code: 'CAMPUS_REQUIRED', message: 'X-Campus-Id header is required' });
    }

    // 1. Validate campus exists and belongs to this tenant
    const campus = await prisma.campus.findUnique({ where: { id: campusId } });

    if (!campus || campus.tenantId !== tenantId) {
      return res.status(404).json({ code: 'CAMPUS_NOT_FOUND', message: 'Campus not found' });
    }

    if (!campus.isActive) {
      return res.status(404).json({ code: 'CAMPUS_NOT_FOUND', message: 'Campus is inactive' });
    }

    // 2. Validate user access
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'User context missing' });
    }

    // ORG_OWNER and ORG_ADMIN are tenant-wide admins — bypass campus access check
    const authTenantRole: string = (req as any).auth?.tenant_role ?? '';
    const isOrgAdmin = authTenantRole === 'ORG_OWNER' || authTenantRole === 'ORG_ADMIN';

    if (!isOrgAdmin) {
      // Check profile.allCampusesAccess first (simple, no join needed)
      const profile = await prisma.profile.findUnique({
        where: { id: userId },
        select: { allCampusesAccess: true },
      });

      if (!profile) {
        return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'User profile not found' });
      }

      let hasAccess = profile.allCampusesAccess === true;

      if (!hasAccess) {
        // Fall back to user_campus_access table via raw SQL (relation may not be in Prisma schema)
        const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
          `SELECT count(*)::text as count FROM user_campus_access
           WHERE profile_id = $1::uuid AND campus_id = $2::uuid AND tenant_id = $3::uuid`,
          userId,
          campusId,
          tenantId,
        );
        hasAccess = parseInt(rows[0]?.count ?? '0', 10) > 0;
      }

      if (!hasAccess) {
        return res.status(403).json({ code: 'CAMPUS_FORBIDDEN', message: 'You do not have access to this campus' });
      }
    }

    // 3. Attach campus context for downstream middleware/controllers
    (req as any).campus = {
      campusId: campus.id,
      campusType: campus.campusType,
      name: campus.name,
    };

    return next();
  } catch (error) {
    console.error('requireCampusContext error:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error processing campus context' });
  }
};
