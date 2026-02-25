"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const client_1 = require("../../../infrastructure/supabase/client");
const client_2 = __importDefault(require("../../../infrastructure/prisma/client"));
const requireAuth = async (req, res, next) => {
    var _a, _b, _c, _d, _e;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res
            .status(401)
            .json({
            error: {
                code: "UNAUTHORIZED",
                message: "Missing Authorization header",
            },
        });
        return;
    }
    const token = authHeader.split(" ")[1];
    if (!token) {
        res
            .status(401)
            .json({
            error: { code: "UNAUTHORIZED", message: "Missing Bearer token" },
        });
        return;
    }
    try {
        const { data: { user }, error, } = await client_1.supabase.auth.getUser(token);
        if (error || !user) {
            console.error("Auth Error:", error);
            res
                .status(401)
                .json({
                error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
            });
            return;
        }
        let profileData = null;
        try {
            const userId = user.id.replace(/'/g, "''");
            const rawProfiles = await client_2.default.$queryRawUnsafe(`SELECT id, email, full_name as "fullName", role, campus_scope as "campusScope", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt" FROM profiles WHERE id = '${userId}'`);
            if (Array.isArray(rawProfiles) && rawProfiles.length > 0) {
                profileData = rawProfiles[0];
                if (profileData.campusScope &&
                    !["SCHOOL", "PU"].includes(profileData.campusScope)) {
                    console.log(`Fixing invalid campus_scope '${profileData.campusScope}' for user ${user.id}`);
                    profileData.campusScope = "SCHOOL";
                    try {
                        await client_2.default.$executeRawUnsafe(`UPDATE profiles SET campus_scope = 'SCHOOL' WHERE id = '${userId}'`);
                    }
                    catch (updateErr) {
                        console.warn("Failed to update invalid campus_scope:", updateErr);
                    }
                }
            }
        }
        catch (rawErr) {
            console.warn("Failed to fetch profile via raw SQL:", rawErr);
        }
        let profile = profileData;
        if (!profile) {
            try {
                profile = await client_2.default.profile.findUnique({
                    where: { id: user.id },
                });
            }
            catch (prismaErr) {
                console.warn("Failed to fetch profile via Prisma:", prismaErr);
            }
        }
        if (!profile) {
            if (!user.email) {
                res
                    .status(401)
                    .json({
                    error: {
                        code: "UNAUTHORIZED",
                        message: "User email not found in auth token",
                    },
                });
                return;
            }
            const fullName = ((_a = user.user_metadata) === null || _a === void 0 ? void 0 : _a.full_name) || "";
            const validRoles = [
                "ADMIN",
                "ACCOUNTANT",
                "STAFF",
                "TEACHER",
                "STUDENT",
                "PARENT",
            ];
            const roleFromMetadata = (_b = user.user_metadata) === null || _b === void 0 ? void 0 : _b.role;
            const role = roleFromMetadata && validRoles.includes(roleFromMetadata)
                ? roleFromMetadata
                : "STUDENT";
            const validCampusScopes = ["SCHOOL", "PU"];
            const campusScopeFromMetadata = (_c = user.user_metadata) === null || _c === void 0 ? void 0 : _c.campus_scope;
            const campusScope = campusScopeFromMetadata &&
                validCampusScopes.includes(campusScopeFromMetadata)
                ? campusScopeFromMetadata
                : null;
            try {
                profile = await client_2.default.profile.create({
                    data: {
                        id: user.id,
                        email: user.email,
                        fullName: fullName,
                        role: role,
                        campusScope: campusScope,
                        isActive: true,
                    },
                });
                console.log(`Auto-created profile for user ${user.id} with role ${role}`);
            }
            catch (createErr) {
                console.error(`Failed to auto-create profile for user ${user.id}:`, (createErr === null || createErr === void 0 ? void 0 : createErr.message) || createErr);
                res
                    .status(401)
                    .json({
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Failed to initialize user profile",
                    },
                });
                return;
            }
        }
        if (!profile.isActive) {
            console.warn(`Inactive user attempt: ${user.email}`);
            res
                .status(403)
                .json({
                error: { code: "FORBIDDEN", message: "Account is deactivated." },
            });
            return;
        }
        if (req.tenant) {
            if (!profile.tenantId) {
                res
                    .status(403)
                    .json({
                    error: {
                        code: "TENANT_MISMATCH",
                        message: "User profile is not associated with any tenant",
                    },
                });
                return;
            }
            if (profile.tenantId !== req.tenant.tenantId) {
                console.warn(`Tenant isolation violation: User ${user.id} (tenant ${profile.tenantId}) attempted to access tenant ${req.tenant.tenantId}`);
                res
                    .status(403)
                    .json({
                    error: {
                        code: "TENANT_MISMATCH",
                        message: "You do not have access to this tenant",
                    },
                });
                return;
            }
        }
        req.user = {
            id: profile.id,
            email: profile.email || user.email,
            fullName: profile.fullName || "",
            role: profile.role,
            campusScope: (_d = profile.campusScope) !== null && _d !== void 0 ? _d : null,
            isActive: profile.isActive,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
            tenantId: profile.tenantId || "",
            allCampusesAccess: profile.allCampusesAccess || false,
        };
        next();
    }
    catch (err) {
        console.error("Unexpected Auth Middleware Error:", (err === null || err === void 0 ? void 0 : err.message) || String(err));
        if ((_e = err === null || err === void 0 ? void 0 : err.message) === null || _e === void 0 ? void 0 : _e.includes("not found in enum")) {
            console.error("Invalid enum value detected in profile - data cleanup attempted via raw SQL");
        }
        res
            .status(500)
            .json({
            error: {
                code: "INTERNAL_ERROR",
                message: "Internal Server Error during Authentication",
            },
        });
        return;
    }
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=requireAuth.js.map