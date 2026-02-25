"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tenant_1 = require("../../../middleware/tenant");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const TenantController_1 = require("../controllers/TenantController");
const router = (0, express_1.Router)();
router.use(tenant_1.resolveTenant);
router.use(requireAuth_1.requireAuth);
router.get('/me', TenantController_1.getTenantMe);
router.get('/campuses', (0, requireRole_1.requireRole)(['ADMIN']), TenantController_1.getCampuses);
router.post('/campuses', (0, requireRole_1.requireRole)(['ADMIN']), TenantController_1.createCampus);
router.patch('/features', (0, requireRole_1.requireRole)(['ADMIN']), TenantController_1.updateFeatures);
exports.default = router;
//# sourceMappingURL=tenantRoutes.js.map