import { Router } from "express";
import { UserController } from "../controllers/UserController";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// Base: /api/admin/users — all require full auth chain + campus + ADMIN
const adminCampus = [
  verifyJwt,
  resolveTenant,
  enforceTenantMatch,
  requireAuth,
  requireCampusContext,
  requireRole(["ADMIN"]),
];

router.get("/", adminCampus, UserController.getUsers);
router.get("/:id", adminCampus, UserController.getUser);
router.post("/", adminCampus, UserController.createUser);
router.patch("/:id", adminCampus, UserController.updateUser);
router.post("/:id/resend-invite", adminCampus, UserController.resendInvite);
router.post("/:id/reset-password", adminCampus, UserController.resetPassword);

export default router;
