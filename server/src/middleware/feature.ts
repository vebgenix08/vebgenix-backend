import { Request, Response, NextFunction } from 'express';
import prisma from '../infrastructure/prisma/client';

export const FEATURES = {
  ADMISSIONS: 'ADMISSIONS',
  FINANCE: 'FINANCE',
  STUDENT_PORTAL: 'STUDENT_PORTAL',
  ATTENDANCE: 'ATTENDANCE',
  DASHBOARD: 'DASHBOARD',
  STUDENTS: 'STUDENTS',
  ACADEMICS: 'ACADEMICS',
  HR: 'HR',
  EXAMS: 'EXAMS',
  CERTIFICATES: 'CERTIFICATES',
  COMMUNICATION: 'COMMUNICATION',
  REPORTS: 'REPORTS',
  HOSTEL: 'HOSTEL',
  TRANSPORT: 'TRANSPORT',
  LIBRARY: 'LIBRARY',
  TIMETABLE: 'TIMETABLE',
};

export const requireFeature = (featureKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. Check if tenant context exists
      if (!(req as any).tenant) {
        res.status(500).json({ 
          error: { 
            code: 'TENANT_CONTEXT_MISSING', 
            message: 'Tenant context missing for feature check' 
          } 
        });
        return;
      }

      // 2. Check feature flag in DB
      const tenantId = (req as any).tenant.tenantId;
      
      const feature = await prisma.tenantFeature.findUnique({
        where: {
          tenantId_featureKey: {
            tenantId,
            featureKey
          }
        },
        select: { enabled: true }
      });

      if (!feature || !feature.enabled) {
        res.status(403).json({ 
          error: { 
            code: 'FEATURE_DISABLED', 
            message: `Feature '${featureKey}' is not enabled for this tenant` 
          } 
        });
        return;
      }

      next();
    } catch (err) {
      console.error('Feature Middleware Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  };
};
