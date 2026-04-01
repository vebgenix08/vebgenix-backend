import { Router } from "express";
import authRoutes from "./authRoutes";
import tenantRoutes from "./tenantRoutes";
import platformRoutes from "./platform.routes";
import admissionsRoutes from "./admissions.routes";
import userRoutes from "./userRoutes";
import studentRoutes from "./studentRoutes";
import dashboardRoutes from "./dashboard.routes";
import resultsRoutes from "./results.routes";
import financeRoutes from "./finance.routes";
import { resolveTenant } from "../middleware/resolveTenant";
import { requireAuth } from "../middleware/requireAuth";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { AuthController } from "../controllers/AuthController";

const router = Router();

// Public Health Check
router.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Deterministic Auth Identity (Public/Token-only)
// This is the global endpoint to check "Who am I?" based on token
// No tenant resolution needed here as it reads claims from token
router.get("/auth/whoami", AuthController.whoami);

// Protected 'Me' Route (Tenant + Campus Context)
// This endpoint requires a resolved tenant and authenticated user
router.get(
  "/me",
  requireAuth, // Run Auth first to populate req.auth from token
  resolveTenant, // Then run Tenant resolution (which checks req.auth.tenantId)
  requireCampusContext,
  AuthController.getMe,
);

// Mount Routes
router.use("/auth", authRoutes);
router.use("/platform", platformRoutes);
router.use("/tenants/:tenantId", tenantRoutes);
// Keep old /tenant for backward compatibility if needed, but it will rely on JWT claim
router.use("/tenant", tenantRoutes);
router.use("/admissions", admissionsRoutes);
router.use("/admin/users", userRoutes);
router.use("/admin/students", studentRoutes);
router.use("/admin/dashboard", dashboardRoutes);
router.use("/results", resultsRoutes);
router.use("/admin/finance", financeRoutes);

export default router;
