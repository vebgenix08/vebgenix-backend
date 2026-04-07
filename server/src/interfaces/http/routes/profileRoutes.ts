import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { requireRole } from "../middleware/requireRole";
import { ProfileController } from "../controllers/ProfileController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);
router.use(requireCampusContext);

router.get("/me", requireRole(["ADMIN", "STAFF", "ACCOUNTANT"]), ProfileController.getMyProfile);
router.patch("/me", requireRole(["ADMIN", "STAFF", "ACCOUNTANT"]), ProfileController.updateMyProfile);
router.post(
  "/me/avatar",
  requireRole(["ADMIN", "STAFF", "ACCOUNTANT"]),
  upload.single("image"),
  ProfileController.uploadAvatar,
);
router.post(
  "/tenant-logo",
  requireRole(["ADMIN", "STAFF"]),
  upload.single("image"),
  ProfileController.uploadTenantLogo,
);

export default router;
