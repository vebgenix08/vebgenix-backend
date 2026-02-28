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
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/confirm-forgot-password", AuthController.confirmForgotPassword);

// WHOAMI - Deterministic auth routing
router.get("/whoami", AuthController.whoami);

export default router;
