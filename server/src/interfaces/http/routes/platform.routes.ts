import { Router } from "express";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { PlatformController } from "../controllers/PlatformController";

const router = Router();

// Protect ALL routes with Super Admin check
router.use(requireSuperAdmin);

// Platform user info
router.get("/me", PlatformController.getMe);
router.get("/audit-logs", PlatformController.listAuditLogs);
router.get("/audit-logs/:logId", PlatformController.getAuditLog);

// Tenants
router.get("/tenants", PlatformController.listTenants);
router.post("/tenants", PlatformController.createTenant);
router.patch("/tenants/:tenantId", PlatformController.updateTenant);

// Campuses (nested under tenant)
router.get("/tenants/:tenantId/campuses", PlatformController.listCampuses);
router.post("/tenants/:tenantId/campuses", PlatformController.createCampus);
router.patch("/campuses/:campusId", PlatformController.updateCampus);

// Features (nested under tenant)
router.get("/tenants/:tenantId/features", PlatformController.listFeatures);
router.patch("/tenants/:tenantId/features", PlatformController.updateFeatures);

// Onboarding finalization
router.post("/tenants/:tenantId/finalize", PlatformController.finalizeTenant);

// Primary admin (primary Admin) for a tenant
router.post(
  "/tenants/:tenantId/first-admin",
  PlatformController.createFirstAdmin,
);

// Resend invite
router.post("/users/:userId/resend-invite", PlatformController.resendInvite);

// Users (nested under tenant)
router.get("/tenants/:tenantId/users", PlatformController.listTenantUsers);
router.post("/tenants/:tenantId/users", PlatformController.provisionTenantUser);
// TODO: Add PATCH /tenants/:tenantId/users/:userId when updateTenantUser is implemented

// Impersonate user
router.post("/impersonate", PlatformController.impersonate);

export default router;
