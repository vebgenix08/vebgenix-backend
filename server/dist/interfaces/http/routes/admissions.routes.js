"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const tenant_1 = require("../../../middleware/tenant");
const campus_1 = require("../../../middleware/campus");
const feature_1 = require("../../../middleware/feature");
const AdmissionsController = __importStar(require("../controllers/AdmissionsController"));
const router = (0, express_1.Router)();
router.post('/enquiries/public', AdmissionsController.createEnquiry);
router.use(tenant_1.resolveTenant);
router.use(requireAuth_1.requireAuth);
router.use(campus_1.requireCampusAccess);
router.use((0, feature_1.requireFeature)(feature_1.FEATURES.ADMISSIONS));
router.get('/enquiries', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.getEnquiries);
router.patch('/enquiries/:id/status', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.updateEnquiryStatus);
router.post('/applications', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.createApplication);
router.get('/applications', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.getApplications);
router.get('/applications/:id', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.getApplicationById);
router.patch('/applications/:id/status', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.updateApplicationStatus);
router.post('/applications/:id/enroll', (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), AdmissionsController.enrollStudent);
exports.default = router;
//# sourceMappingURL=admissions.routes.js.map