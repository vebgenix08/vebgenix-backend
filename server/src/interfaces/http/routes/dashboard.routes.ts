import { Router } from 'express';
import { resolveTenant } from '../middleware/resolveTenant';
import { requireAuth } from '../middleware/requireAuth';
import { requireCampusContext } from '../middleware/requireCampusContext';
import { requireRole } from '../middleware/requireRole';
import { requirePermission } from '../middleware/requirePermission';
import { requireFeature, FEATURES } from '../../../middleware/feature';
import * as TenantDashboardController from '../controllers/TenantDashboardController';

const router = Router();

/**
 * Base middleware stack for all dashboard routes:
 * 1. resolveTenant      — subdomain → tenant
 * 2. requireAuth        — token → user + resolves req.auth (permissions)
 * 3. requireCampusContext — validates X-Campus-Id + campus membership
 * 4. requireFeature(DASHBOARD) — feature flag gate
 * 5. requireRole        — legacy role gate (kept until full rollout)
 * 6. requirePermission  — new permission gate (added alongside requireRole)
 */
const baseMiddleware = [
  resolveTenant,
  requireAuth,
  requireCampusContext,
  requireFeature(FEATURES.DASHBOARD),
  requireRole(['ADMIN', 'ACCOUNTANT'] as import('../../../domain/User').UserRole[]),
];

/**
 * GET /admin/dashboard/summary
 * General dashboard: active students + admissions KPIs (if user has admissions permission).
 * Finance sections are NOT included here — use /finance-summary for those.
 */
router.get(
  '/summary',
  ...baseMiddleware,
  requirePermission('dashboard.view'),
  TenantDashboardController.getSummary
);

/**
 * GET /admin/dashboard/finance-summary
 * Finance-only dashboard payload: finance KPIs + recent finance activity.
 * Gated with dashboard.view.finance permission — no extra permission checks needed in controller.
 */
router.get(
  '/finance-summary',
  ...baseMiddleware,
  requirePermission('dashboard.view.finance'),
  TenantDashboardController.getFinanceSummary
);

export default router;
