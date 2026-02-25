"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserController_1 = require("../controllers/UserController");
const requireAuth_1 = require("../middleware/requireAuth");
const requireRole_1 = require("../middleware/requireRole");
const router = (0, express_1.Router)();
router.post('/', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN']), UserController_1.UserController.createUser);
router.post('/:id/resend-invite', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN']), UserController_1.UserController.resendInvite);
router.post('/:id/reset-password', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN']), UserController_1.UserController.resetPassword);
router.get('/', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN']), UserController_1.UserController.getUsers);
router.patch('/:id', requireAuth_1.requireAuth, (0, requireRole_1.requireRole)(['ADMIN']), UserController_1.UserController.updateUser);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map