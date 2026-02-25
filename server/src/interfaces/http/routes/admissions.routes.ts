import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireRole } from '../middleware/requireRole';
import { requirePermission } from '../middleware/requirePermission';
import { resolveTenant } from '../middleware/resolveTenant';
import { requireCampusContext } from '../middleware/requireCampusContext';
import { requireFeature, FEATURES } from '../../../middleware/feature';
import * as AdmissionsController from '../controllers/AdmissionsController';

const router = Router();

// Public Routes (e.g. Website Enquiry Form) - No tenant/auth required
router.post('/enquiries/public', AdmissionsController.createEnquiry);

// Protected Routes - Require tenant, auth, campus access, and ADMISSIONS feature
router.use(resolveTenant);
router.use(requireAuth);
router.use(requireCampusContext);
router.use(requireFeature(FEATURES.ADMISSIONS));

// Enquiries
// Phase 5: requirePermission added ALONGSIDE requireRole (both must pass)
router.get('/enquiries', requireRole(['ADMIN', 'ACCOUNTANT']), requirePermission('admissions.enquiry.view'), AdmissionsController.getEnquiries);
router.patch('/enquiries/:id/status', requireRole(['ADMIN', 'ACCOUNTANT']), AdmissionsController.updateEnquiryStatus);

// Applications
// Phase 5: requirePermission added ALONGSIDE requireRole (both must pass)
router.post('/applications', requireRole(['ADMIN', 'ACCOUNTANT']), AdmissionsController.createApplication);
router.get('/applications', requireRole(['ADMIN', 'ACCOUNTANT']), requirePermission('admissions.application.view'), AdmissionsController.getApplications);
router.get('/applications/:id', requireRole(['ADMIN', 'ACCOUNTANT']), AdmissionsController.getApplicationById);
router.patch('/applications/:id/status', requireRole(['ADMIN', 'ACCOUNTANT']), AdmissionsController.updateApplicationStatus);

// Enrollment (Critical Action)
router.post('/applications/:id/enroll', requireRole(['ADMIN', 'ACCOUNTANT']), AdmissionsController.enrollStudent);

export default router;
