import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { requireRole } from "../middleware/requireRole";
import { requireFeature, FEATURES } from "../../../middleware/feature";
import { ResultsController } from "../controllers/ResultsController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ]);
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error("Only PDF, Excel, or CSV result files are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.get("/public/:token", ResultsController.getPublicBatch);

router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);
router.use(requireCampusContext);
router.use(requireFeature(FEATURES.EXAMS));

router.get(
  "/batches",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  ResultsController.listBatches,
);
router.post(
  "/batches",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  upload.single("file"),
  ResultsController.createBatch,
);
router.patch(
  "/batches/:id/publish",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  ResultsController.updatePublishStatus,
);

export default router;
