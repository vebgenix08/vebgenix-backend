"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const client_1 = require("../../../infrastructure/supabase/client");
const emailService_1 = require("../../../infrastructure/services/emailService");
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
class AuthController {
    static async forgotPassword(req, res) {
        var _a;
        const genericResponse = { message: 'If the email is registered, a reset link will be sent.' };
        try {
            const { email } = req.body;
            if (!email) {
                return res.status(200).json(genericResponse);
            }
            const normalizedEmail = String(email).trim().toLowerCase();
            const user = await findAuthUserByEmail(normalizedEmail);
            if (user) {
                const { data, error } = await client_1.supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email: user.email,
                    options: { redirectTo: `${APP_BASE_URL}/auth/callback` }
                });
                if (!error && ((_a = data.properties) === null || _a === void 0 ? void 0 : _a.action_link)) {
                    const loginUrl = `${APP_BASE_URL}/login`;
                    await emailService_1.EmailService.sendMail(user.email, 'Reset your ERP password', `<p>Reset your password using the link below:</p>
             <p><a href="${data.properties.action_link}">Reset Password</a></p>
             <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
                }
            }
            return res.status(200).json(genericResponse);
        }
        catch (error) {
            console.error(`AuthController.forgotPassword error: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return res.status(200).json(genericResponse);
        }
    }
}
exports.AuthController = AuthController;
async function findAuthUserByEmail(email) {
    const normalizedEmail = email.toLowerCase();
    const perPage = 200;
    let page = 1;
    while (true) {
        const { data, error } = await client_1.supabase.auth.admin.listUsers({ page, perPage });
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
//# sourceMappingURL=AuthController.js.map