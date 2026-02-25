"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireAuth_1 = require("../middleware/requireAuth");
const admissions_routes_1 = __importDefault(require("./admissions.routes"));
const userRoutes_1 = __importDefault(require("./userRoutes"));
const studentRoutes_1 = __importDefault(require("./studentRoutes"));
const authRoutes_1 = __importDefault(require("./authRoutes"));
const tenantRoutes_1 = __importDefault(require("./tenantRoutes"));
const router = (0, express_1.Router)();
router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});
router.get('/me', requireAuth_1.requireAuth, (req, res) => {
    res.json({ user: req.user });
});
router.use('/auth', authRoutes_1.default);
router.use('/tenant', tenantRoutes_1.default);
router.use('/admissions', admissions_routes_1.default);
router.use('/admin/users', userRoutes_1.default);
router.use('/admin/students', studentRoutes_1.default);
exports.default = router;
//# sourceMappingURL=index.js.map