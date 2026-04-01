import { Router } from "express";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { requirePermission } from "../middleware/requirePermission";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { requireFeature, FEATURES } from "../../../middleware/feature";
import * as AdmissionsController from "../controllers/AdmissionsController";
// NOTE: /applications/approvals MUST be mounted before /applications/:id
// to prevent "approvals" being treated as a UUID.

const router = Router();

// Public Routes (e.g. Website Enquiry Form) - No tenant/auth required
router.post("/enquiries/public", AdmissionsController.createEnquiry);

// Protected Routes - Require full auth chain + campus + ADMISSIONS feature
router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);
router.use(requireCampusContext);
router.use(requireFeature(FEATURES.ADMISSIONS));

// Enquiries
router.get(
  "/enquiries",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  requirePermission("admissions.enquiry.view"),
  AdmissionsController.getEnquiries,
);
router.patch(
  "/enquiries/:id/status",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  AdmissionsController.updateEnquiryStatus,
);

// Applications
router.post(
  "/applications",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  AdmissionsController.createApplication,
);
router.get(
  "/applications",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  requirePermission("admissions.application.view"),
  AdmissionsController.getApplications,
);
// IMPORTANT: /approvals must come before /:id to avoid routing "approvals" as a UUID
router.get(
  "/applications/approvals",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  AdmissionsController.getApprovalQueue,
);
router.get(
  "/applications/:id",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  AdmissionsController.getApplicationById,
);
router.patch(
  "/applications/:id/status",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  AdmissionsController.updateApplicationStatus,
);

// Enrollment (Critical Action)
router.post(
  "/applications/:id/enroll",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  AdmissionsController.enrollStudent,
);

export default router;
