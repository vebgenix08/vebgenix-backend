import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { resolveTenant } from '../middleware/resolveTenant';
import { requireAuth } from '../middleware/requireAuth';
import { requireCampusContext } from '../middleware/requireCampusContext';
import { requireRole } from '../middleware/requireRole';

const router = Router();

// Base: /api/admin/users — all require tenant + auth + campus + ADMIN
const adminCampus = [resolveTenant, requireAuth, requireCampusContext, requireRole(['ADMIN'])];

router.get('/', adminCampus, UserController.getUsers);
router.get('/:id', adminCampus, UserController.getUser);
router.post('/', adminCampus, UserController.createUser);
router.patch('/:id', adminCampus, UserController.updateUser);
router.post('/:id/resend-invite', adminCampus, UserController.resendInvite);
router.post('/:id/reset-password', adminCampus, UserController.resetPassword);

export default router;
