import { Router } from 'express';
import { StudentController } from '../controllers/StudentController';
import { resolveTenant } from '../middleware/resolveTenant';
import { requireAuth } from '../middleware/requireAuth';
import { requireCampusContext } from '../middleware/requireCampusContext';
import { requireRole } from '../middleware/requireRole';

const router = Router();
const tenantCampus = [resolveTenant, requireAuth, requireCampusContext];

router.get(
  '/',
  ...tenantCampus,
  requireRole(['ADMIN', 'ACCOUNTANT', 'TEACHER', 'STAFF']),
  StudentController.getAllStudents
);

router.post(
  '/:studentId/enable-portal',
  ...tenantCampus,
  requireRole(['ADMIN', 'ACCOUNTANT']),
  StudentController.enablePortalAccess
);

router.post(
  '/:studentId/reset-password',
  ...tenantCampus,
  requireRole(['ADMIN', 'ACCOUNTANT']),
  StudentController.resetStudentPassword
);

export default router;
