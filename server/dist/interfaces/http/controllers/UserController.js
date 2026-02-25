"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const client_1 = require("../../../infrastructure/supabase/client");
const client_2 = __importDefault(require("../../../infrastructure/prisma/client"));
const emailService_1 = require("../../../infrastructure/services/emailService");
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
class UserController {
    static async createUser(req, res) {
        var _a;
        try {
            const { email, full_name, role, campus_scope, sendInvite } = req.body;
            const campusScope = campus_scope !== null && campus_scope !== void 0 ? campus_scope : null;
            if (!email || !full_name || !role) {
                res
                    .status(400)
                    .json({
                    error: { code: "BAD_REQUEST", message: "Missing required fields" },
                });
                return;
            }
            const normalizedEmail = String(email).trim().toLowerCase();
            if (!isValidEmail(normalizedEmail)) {
                res
                    .status(400)
                    .json({
                    error: { code: "BAD_REQUEST", message: "Invalid email format" },
                });
                return;
            }
            let authUser = await findAuthUserByEmail(normalizedEmail);
            const alreadyExisted = !!authUser;
            if (!authUser) {
                const { data, error: createError } = await client_1.supabase.auth.admin.createUser({
                    email: normalizedEmail,
                    email_confirm: true,
                    user_metadata: Object.assign({ full_name,
                        role }, (campusScope ? { campus_scope: campusScope } : {})),
                });
                if (createError || !data.user) {
                    throw createError || new Error("Failed to create user");
                }
                authUser = data.user;
            }
            else {
                await client_1.supabase.auth.admin.updateUserById(authUser.id, {
                    user_metadata: Object.assign({ full_name,
                        role }, (campusScope ? { campus_scope: campusScope } : {})),
                });
            }
            await client_2.default.profile.upsert({
                where: { id: authUser.id },
                create: {
                    id: authUser.id,
                    email: normalizedEmail,
                    fullName: full_name,
                    role: role,
                    campusScope: campusScope,
                    isActive: true,
                },
                update: {
                    fullName: full_name,
                    role: role,
                    campusScope: campusScope,
                    isActive: true,
                    email: normalizedEmail,
                },
            });
            let inviteSent = false;
            if (sendInvite) {
                const { data: linkData, error: linkError } = await client_1.supabase.auth.admin.generateLink({
                    type: "invite",
                    email: normalizedEmail,
                    options: { redirectTo: `${APP_BASE_URL}/auth/callback` },
                });
                if (!linkError && ((_a = linkData.properties) === null || _a === void 0 ? void 0 : _a.action_link)) {
                    const loginUrl = `${APP_BASE_URL}/login`;
                    await emailService_1.EmailService.sendMail(normalizedEmail, "ERP Access – Set your password", `<p>Set your password using the link below:</p>
             <p><a href="${linkData.properties.action_link}">Set Password</a></p>
             <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
                    inviteSent = true;
                }
                else if (linkError) {
                    console.error(`UserController.createUser invite error: ${linkError.message}`);
                }
            }
            const statusCode = alreadyExisted ? 200 : 201;
            res
                .status(statusCode)
                .json({ userId: authUser.id, alreadyExisted, inviteSent });
        }
        catch (err) {
            console.error(`UserController.createUser error: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            res
                .status(500)
                .json({
                error: { code: "INTERNAL_ERROR", message: "Failed to create user" },
            });
        }
    }
    static async getUsers(req, res) {
        try {
            const { query, role, campus, status, page = 1, limit = 20 } = req.query;
            const where = {};
            if (query) {
                where.OR = [
                    { fullName: { contains: String(query), mode: "insensitive" } },
                    { email: { contains: String(query), mode: "insensitive" } },
                ];
            }
            if (role && role !== "all")
                where.role = String(role).toUpperCase();
            if (campus && campus !== "all")
                where.campusScope = String(campus).toUpperCase();
            if (status && status !== "all")
                where.isActive = status === "active";
            const skip = (Number(page) - 1) * Number(limit);
            const [users, total] = await Promise.all([
                client_2.default.profile.findMany({
                    where,
                    skip,
                    take: Number(limit),
                    orderBy: { createdAt: "desc" },
                }),
                client_2.default.profile.count({ where }),
            ]);
            res.json({
                users,
                pagination: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    pages: Math.ceil(total / Number(limit)),
                },
            });
        }
        catch (err) {
            res.status(500).json({ error: { message: err.message } });
        }
    }
    static async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { full_name, role, campus_scope, is_active } = req.body;
            if (full_name || role || campus_scope !== undefined) {
                const updates = {};
                if (full_name)
                    updates.full_name = full_name;
                if (role)
                    updates.role = role;
                if (campus_scope !== undefined)
                    updates.campus_scope = campus_scope;
                await client_1.supabase.auth.admin.updateUserById(id, {
                    user_metadata: updates,
                });
            }
            const updateData = {};
            if (full_name)
                updateData.fullName = full_name;
            if (role)
                updateData.role = role;
            if (campus_scope !== undefined)
                updateData.campusScope = campus_scope;
            if (is_active !== undefined)
                updateData.isActive = is_active;
            const user = await client_2.default.profile.update({
                where: { id },
                data: updateData,
            });
            res.json(user);
        }
        catch (err) {
            console.error(`UserController.updateUser error: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            res.status(500).json({ error: { message: "Failed to update user" } });
        }
    }
    static async resendInvite(req, res) {
        var _a;
        try {
            const { id } = req.params;
            const authUser = await getAuthUserById(id);
            if (!(authUser === null || authUser === void 0 ? void 0 : authUser.email))
                return res.status(404).json({ error: { message: "User not found" } });
            const { data, error } = await client_1.supabase.auth.admin.generateLink({
                type: "invite",
                email: authUser.email,
                options: { redirectTo: `${APP_BASE_URL}/auth/callback` },
            });
            if (error)
                throw error;
            if ((_a = data.properties) === null || _a === void 0 ? void 0 : _a.action_link) {
                const loginUrl = `${APP_BASE_URL}/login`;
                await emailService_1.EmailService.sendMail(authUser.email, "ERP Access – Set your password", `<p>Set your password using the link below:</p>
           <p><a href="${data.properties.action_link}">Set Password</a></p>
           <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
            }
            return res.status(200).json({ inviteSent: true });
        }
        catch (err) {
            console.error(`UserController.resendInvite error: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            return res
                .status(500)
                .json({ error: { message: "Failed to resend invite" } });
        }
    }
    static async resetPassword(req, res) {
        var _a;
        try {
            const { id } = req.params;
            const authUser = await getAuthUserById(id);
            if (!(authUser === null || authUser === void 0 ? void 0 : authUser.email))
                return res.status(404).json({ error: { message: "User not found" } });
            const { data, error } = await client_1.supabase.auth.admin.generateLink({
                type: "recovery",
                email: authUser.email,
                options: { redirectTo: `${APP_BASE_URL}/auth/callback` },
            });
            if (error)
                throw error;
            if ((_a = data.properties) === null || _a === void 0 ? void 0 : _a.action_link) {
                const loginUrl = `${APP_BASE_URL}/login`;
                await emailService_1.EmailService.sendMail(authUser.email, "Reset your ERP password", `<p>Reset your password using the link below:</p>
           <p><a href="${data.properties.action_link}">Reset Password</a></p>
           <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
            }
            return res.status(200).json({ resetSent: true });
        }
        catch (err) {
            console.error(`UserController.resetPassword error: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
            return res
                .status(500)
                .json({ error: { message: "Failed to reset password" } });
        }
    }
}
exports.UserController = UserController;
async function findAuthUserByEmail(email) {
    const normalizedEmail = email.toLowerCase();
    const perPage = 200;
    let page = 1;
    while (true) {
        const { data, error } = await client_1.supabase.auth.admin.listUsers({
            page,
            perPage,
        });
        if (error)
            throw error;
        const users = (data === null || data === void 0 ? void 0 : data.users) || [];
        const found = users.find((u) => { var _a; return ((_a = u.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === normalizedEmail; });
        if (found)
            return found;
        if (users.length < perPage)
            return null;
        page += 1;
    }
}
async function getAuthUserById(id) {
    var _a;
    const { data, error } = await client_1.supabase.auth.admin.getUserById(id);
    if (error)
        return null;
    return (_a = data === null || data === void 0 ? void 0 : data.user) !== null && _a !== void 0 ? _a : null;
}
//# sourceMappingURL=UserController.js.map