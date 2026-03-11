import { Router } from "express";
import { StudentController } from "../controllers/StudentController";
import { AuthController } from "../controllers/AuthController"; // Create/Update this

const router = Router();

// Student Public Auth
router.post("/student/login", StudentController.studentLogin);
router.post(
  "/student/forgot-password",
  StudentController.studentForgotPassword,
);

// General Public Auth
router.post("/login", AuthController.login);
router.post("/refresh", AuthController.refreshToken);
router.post("/logout", AuthController.logout);
router.post("/switch-tenant", AuthController.switchTenant);

router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password", AuthController.resetPassword);
router.post("/confirm-forgot-password", AuthController.resetPassword); // Alias for compatibility if needed

// WHOAMI - Deterministic auth routing
// No resolveTenant middleware here because whoami is global
router.get("/whoami", AuthController.whoami);

// Invite Flow (public — no auth required)
router.post("/invite/verify", AuthController.verifyInvite);
router.post("/invite/accept", AuthController.acceptInvite);

export default router;
