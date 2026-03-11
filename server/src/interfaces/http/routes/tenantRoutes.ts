import { Router } from "express";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  getTenantMe,
  getCampuses,
  createCampus,
  updateFeatures,
} from "../controllers/TenantController";

const router = Router({ mergeParams: true });

// All tenant routes: verifyJwt → resolveTenant → enforceTenantMatch → requireAuth
router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);

// GET /api/tenant/me
router.get("/me", getTenantMe);

// GET /api/tenant/campuses - ADMIN only
router.get("/campuses", requireRole(["ADMIN"]), getCampuses);

// POST /api/tenant/campuses - ADMIN only
router.post("/campuses", requireRole(["ADMIN"]), createCampus);

// PATCH /api/tenant/features - ADMIN only
router.patch("/features", requireRole(["ADMIN"]), updateFeatures);

export default router;
