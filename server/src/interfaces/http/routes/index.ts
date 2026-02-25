import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import admissionsRoutes from './admissions.routes';
import userRoutes from './userRoutes';
import studentRoutes from './studentRoutes';
import authRoutes from './authRoutes';
import tenantRoutes from './tenantRoutes';
import platformRoutes from './platform.routes';
import dashboardRoutes from './dashboard.routes';

import { requireCampusContext } from '../middleware/requireCampusContext';
import { resolveTenant } from '../middleware/resolveTenant';
import { AuthController } from '../controllers/AuthController';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Public Health Check
router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Deterministic Auth Identity (Public/Token-only)
router.get('/auth/whoami', asyncHandler(AuthController.whoami.bind(AuthController)));

// Protected 'Me' Route (Tenant + Campus Context)
router.get('/me', 
  resolveTenant, 
  requireAuth, 
  requireCampusContext, 
  AuthController.getMe
);

router.use('/auth', authRoutes); // Public Auth
router.use('/platform', platformRoutes);
router.use('/tenant', tenantRoutes); // Tenant management
router.use('/admissions', admissionsRoutes);
router.use('/admin/users', userRoutes);
router.use('/admin/students', studentRoutes);
router.use('/admin/dashboard', dashboardRoutes);

export default router;

