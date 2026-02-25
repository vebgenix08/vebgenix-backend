"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const StudentController_1 = require("../controllers/StudentController");
const AuthController_1 = require("../controllers/AuthController");
const router = (0, express_1.Router)();
router.post('/student/login', StudentController_1.StudentController.studentLogin);
router.post('/student/forgot-password', StudentController_1.StudentController.studentForgotPassword);
router.post('/forgot-password', AuthController_1.AuthController.forgotPassword);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map