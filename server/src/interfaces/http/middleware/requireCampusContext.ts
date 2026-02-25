import { Request, Response, NextFunction } from 'express';
import prisma from '../../../infrastructure/prisma/client';

export interface CampusInfo {
  campusId: string;
  campusType: 'SCHOOL' | 'PU' | 'DEGREE';
  name: string;
}

/**
 * Middleware to validate campus access
 * Requires: resolveTenant and requireAuth to be run first
 */
export const requireCampusContext = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenant?.tenantId;
    const campusId = req.header('X-Campus-Id');

    // Tenant context must be present (resolveTenant should run first)
    if (!tenantId) {
       return res.status(500).json({ code: 'TENANT_CONTEXT_MISSING', message: 'Tenant context missing' });
    }

    // Missing X-Campus-Id header -> 400 CAMPUS_REQUIRED
    if (!campusId) {
      return res.status(400).json({ code: 'CAMPUS_REQUIRED', message: 'X-Campus-Id header is required' });
    }

    // 1. Validate Campus belongs to Tenant
    const campus = await prisma.campus.findUnique({
      where: { id: campusId },
    });

    // Campus not found or belongs to another tenant -> 404 CAMPUS_NOT_FOUND
    if (!campus || campus.tenantId !== tenantId) {
      return res.status(404).json({ code: 'CAMPUS_NOT_FOUND', message: 'Campus not found' });
    }

    // Optional: Validate campus is active (not explicitly requested in A2 strict list, but good practice, kept from previous impl)
    if (!campus.isActive) {
      return res.status(404).json({ code: 'CAMPUS_NOT_FOUND', message: 'Campus is inactive' }); // Mask as not found
    }

    // 2. Validate User Access
    const userId = (req as any).user?.id;
    if (!userId) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'User context missing' });
    }
    
    // Fetch user profile with campus access
    const profile = await prisma.profile.findUnique({
        where: { id: userId },
        include: { campusAccess: true }
    });

    if (!profile) {
        return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'User profile not found' });
    }

    let hasAccess = false;
    // allow if profile.all_campuses_access=true
    if (profile.allCampusesAccess) {
        hasAccess = true;
    } else {
        // OR user exists in user_campus_access for that campus
        hasAccess = profile.campusAccess.some(ca => ca.campusId === campusId);
    }

    // else -> 403 CAMPUS_FORBIDDEN
    if (!hasAccess) {
        return res.status(403).json({ code: 'CAMPUS_FORBIDDEN', message: 'You do not have access to this campus' });
    }

    // 3. Attach Context
    (req as any).campus = {
      campusId: campus.id,
      campusType: campus.campusType,
      name: campus.name
    };

    return next();
  } catch (error) {
    console.error('requireCampusContext error:', error);
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error processing campus context' });
  }
};
