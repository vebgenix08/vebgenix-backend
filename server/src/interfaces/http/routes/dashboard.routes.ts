import { Router } from "express";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { requireRole } from "../middleware/requireRole";
import { requirePermission } from "../middleware/requirePermission";
import * as TenantDashboardController from "../controllers/TenantDashboardController";

const router = Router();

/**
 * Base middleware stack for all dashboard routes:
 * 1. verifyJwt           — token signature + expiry
 * 2. resolveTenant       — tenant from token/params (no slug)
 * 3. enforceTenantMatch  — token tenant_id == resolved tenant
 * 4. requireAuth         — profile + permissions
 * 5. requireCampusContext — validates X-Campus-Id + campus membership
 * 6. requireFeature(DASHBOARD) — feature flag gate
 * 7. requireRole         — legacy role gate
 */
const baseMiddleware = [
  verifyJwt,
  resolveTenant,
  enforceTenantMatch,
  requireAuth,
  requireCampusContext,
  // NOTE: DASHBOARD is a core feature — no feature flag gate needed here.
  // Individual widgets inside the controller check their own feature flags.
  requireRole([
    "ADMIN",
    "ACCOUNTANT",
  ] as import("../../../domain/User").UserRole[]),
];

/**
 * GET /admin/dashboard/summary
 */
router.get(
  "/summary",
  ...baseMiddleware,
  requirePermission("dashboard.view"),
  TenantDashboardController.getSummary,
);

/**
 * GET /admin/dashboard/finance-summary
 */
router.get(
  "/finance-summary",
  ...baseMiddleware,
  requirePermission("dashboard.view.finance"),
  TenantDashboardController.getFinanceSummary,
);

export default router;
