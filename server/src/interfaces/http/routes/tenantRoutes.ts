import { Router } from 'express';
import { resolveTenant } from '../middleware/resolveTenant';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import {
  getTenantMe,
  getCampuses,
  createCampus,
  updateFeatures,
} from '../controllers/TenantController';

const router = Router();

// All tenant routes require tenant resolution
// We apply resolveTenant to all routes
router.use(resolveTenant);

// Public route to get tenant info (if needed, but currently not implemented in controller)
// router.get('/info', ...);

// Protected routes (require auth)
router.use(requireAuth);

// GET /api/tenant/me - Get tenant info, user campuses, and features
// Used for bootstrapping the frontend app
router.get('/me', getTenantMe);

// GET /api/tenant/campuses - ADMIN only
router.get('/campuses', requireRole(['ADMIN']), getCampuses);

// POST /api/tenant/campuses - ADMIN only
router.post('/campuses', requireRole(['ADMIN']), createCampus);

// PATCH /api/tenant/features - ADMIN only
router.patch('/features', requireRole(['ADMIN']), updateFeatures);

export default router;
