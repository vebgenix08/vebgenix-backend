import { Router } from "express";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireCampusContext } from "../middleware/requireCampusContext";
import { requireRole } from "../middleware/requireRole";
import { requireFeature, FEATURES } from "../../../middleware/feature";
import { FinanceController } from "../controllers/FinanceController";

const router = Router();

router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);
router.use(requireCampusContext);
router.use(requireFeature(FEATURES.FINANCE));

router.get(
  "/summary",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.getSummary,
);

router.get(
  "/invoices",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.listInvoices,
);

router.post(
  "/invoices/from-assignment",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.createInvoiceFromAssignment,
);

router.post(
  "/charges",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.createOneOffCharge,
);

router.get(
  "/payments",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.listPayments,
);

router.post(
  "/payments",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.collectPayment,
);

router.get(
  "/receipts",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.listReceipts,
);

router.get(
  "/receipts/:receiptId",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.getReceipt,
);

router.get(
  "/fee-assignments/queue",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.getFeeAssignmentQueue,
);

router.get(
  "/fee-structures/options",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.getAssignableFeeStructures,
);

router.post(
  "/fee-assignments",
  requireRole(["ADMIN", "ACCOUNTANT"]),
  FinanceController.assignFeeStructure,
);

export default router;
