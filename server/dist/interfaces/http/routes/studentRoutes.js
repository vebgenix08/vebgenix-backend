"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const StudentController_1 = require("../controllers/StudentController");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const router = (0, express_1.Router)();
router.get('/', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT', 'TEACHER', 'STAFF']), StudentController_1.StudentController.getAllStudents);
router.post('/:studentId/enable-portal', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), StudentController_1.StudentController.enablePortalAccess);
router.post('/:studentId/reset-password', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN', 'ACCOUNTANT']), StudentController_1.StudentController.resetStudentPassword);
exports.default = router;
//# sourceMappingURL=studentRoutes.js.map