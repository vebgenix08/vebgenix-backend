"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentController = void 0;
const client_1 = require("../../../infrastructure/supabase/client");
const client_2 = __importDefault(require("../../../infrastructure/prisma/client"));
const emailService_1 = require("../../../infrastructure/services/emailService");
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const ADMIN_FALLBACK_EMAIL = process.env.ADMIN_FALLBACK_EMAIL || "dhanushags1567@gmail.com";
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
class StudentController {
    static async getAllStudents(req, res) {
        var _a, _b, _c, _d;
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const search = req.query.search || "";
            const status = req.query.status || "all";
            const campusScope = req.query.scope || "All";
            const skip = (page - 1) * limit;
            const where = {};
            if (search) {
                where.OR = [
                    { fullName: { contains: search, mode: "insensitive" } },
                    { registrationNumber: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                    { parentPhone: { contains: search, mode: "insensitive" } },
                ];
            }
            if (status !== "all") {
                where.status = status.toUpperCase();
            }
            if (campusScope === "School") {
                where.campusType = "SCHOOL";
            }
            else if (campusScope === "PU") {
                where.campusType = "PU";
            }
            const [students, total, statusCounts] = await Promise.all([
                client_2.default.student.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        registrationNumber: true,
                        fullName: true,
                        email: true,
                        parentPhone: true,
                        status: true,
                        campusType: true,
                        currentGrade: true,
                        currentSection: true,
                        stream: true,
                    },
                }),
                client_2.default.student.count({ where }),
                client_2.default.student.groupBy({
                    by: ["status"],
                    _count: { status: true },
                }),
            ]);
            const formattedStudents = students.map((s) => ({
                _id: s.id,
                registrationNumber: s.registrationNumber,
                fullName: s.fullName,
                firstName: s.fullName.split(" ")[0],
                lastName: s.fullName.split(" ").slice(1).join(" "),
                email: s.email || "",
                phone: s.parentPhone || "",
                status: s.status,
                campusType: s.campusType,
                term: "2024-25",
                program: s.campusType === "SCHOOL" ? "High School" : "PUC",
                stream: s.stream,
                batch: s.currentGrade + (s.currentSection ? `-${s.currentSection}` : ""),
            }));
            const counts = {
                all: total,
                live: ((_a = statusCounts.find((c) => c.status === "ACTIVE")) === null || _a === void 0 ? void 0 : _a._count.status) || 0,
                inactive: ((_b = statusCounts.find((c) => c.status === "SUSPENDED")) === null || _b === void 0 ? void 0 : _b._count.status) || 0,
                completed: ((_c = statusCounts.find((c) => c.status === "ALUMNI")) === null || _c === void 0 ? void 0 : _c._count.status) || 0,
                cancelled: ((_d = statusCounts.find((c) => c.status === "WITHDRAWN")) === null || _d === void 0 ? void 0 : _d._count.status) || 0,
                previous: 0,
            };
            res.status(200).json({
                students: formattedStudents,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
                counts,
            });
        }
        catch (error) {
            console.error(`StudentController.getAllStudents error: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            res.status(500).json({ error: { message: "Failed to fetch students" } });
        }
    }
    static async enablePortalAccess(req, res) {
        var _a;
        try {
            const { studentId } = req.params;
            const { loginMode, sendInvite } = req.body;
            const student = await client_2.default.student.findUnique({
                where: { id: studentId },
            });
            if (!student) {
                res
                    .status(404)
                    .json({ error: { code: "NOT_FOUND", message: "Student not found" } });
                return;
            }
            if (student.portalAuthUserId) {
                res
                    .status(200)
                    .json({
                    message: "Portal access already enabled",
                    userId: student.portalAuthUserId,
                    alreadyEnabled: true,
                });
                return;
            }
            let authEmail = "";
            if (student.campusType === "PU" &&
                student.email &&
                loginMode === "EMAIL") {
                const normalizedEmail = student.email.toLowerCase().trim();
                if (!isValidEmail(normalizedEmail)) {
                    res
                        .status(400)
                        .json({
                        error: {
                            code: "BAD_REQUEST",
                            message: "Invalid student email format",
                        },
                    });
                    return;
                }
                authEmail = normalizedEmail;
            }
            else {
                authEmail = `${student.registrationNumber.toLowerCase()}@students.internal.local`;
            }
            let authUser = await findAuthUserByEmail(authEmail);
            if (!authUser) {
                const { data, error: createError } = await client_1.supabase.auth.admin.createUser({
                    email: authEmail,
                    email_confirm: true,
                    user_metadata: {
                        full_name: student.fullName,
                        role: "STUDENT",
                        campus_scope: student.campusType,
                    },
                });
                if (createError || !data.user)
                    throw createError || new Error("Failed to create portal user");
                authUser = data.user;
            }
            await client_2.default.student.update({
                where: { id: studentId },
                data: { portalAuthUserId: authUser.id },
            });
            await client_2.default.profile.upsert({
                where: { id: authUser.id },
                create: {
                    id: authUser.id,
                    email: authEmail,
                    fullName: student.fullName,
                    role: "STUDENT",
                    campusScope: student.campusType,
                    isActive: true,
                },
                update: {
                    role: "STUDENT",
                    campusScope: student.campusType,
                    isActive: true,
                    fullName: student.fullName,
                },
            });
            let deliveryDetail = "NONE";
            if (sendInvite) {
                let recipientEmail = "";
                if (student.campusType === "PU" &&
                    student.email &&
                    loginMode === "EMAIL") {
                    recipientEmail = student.email;
                    deliveryDetail = "STUDENT_EMAIL";
                }
                else {
                    recipientEmail = student.parentEmail || ADMIN_FALLBACK_EMAIL;
                    deliveryDetail = student.parentEmail ? "PARENT" : "ADMIN_FALLBACK";
                }
                const { data: linkData, error: linkError } = await client_1.supabase.auth.admin.generateLink({
                    type: "invite",
                    email: authEmail,
                    options: { redirectTo: `${APP_BASE_URL}/auth/callback` },
                });
                if (!linkError && ((_a = linkData.properties) === null || _a === void 0 ? void 0 : _a.action_link)) {
                    const loginUrl = `${APP_BASE_URL}/login`;
                    await emailService_1.EmailService.sendMail(recipientEmail, "ERP Access – Set your password", `<p>Activate the student portal account using the link below:</p>
             <p><a href="${linkData.properties.action_link}">Set Password</a></p>
             <p>Reg No: ${student.registrationNumber}</p>
             <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
                }
                else if (linkError) {
                    console.error(`StudentController.enablePortalAccess invite error: ${linkError.message}`);
                }
            }
            res.status(200).json({
                message: "Portal access enabled",
                portalUserId: authUser.id,
                alreadyEnabled: false,
                delivery: deliveryDetail,
            });
        }
        catch (error) {
            console.error(`StudentController.enablePortalAccess error: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            res
                .status(500)
                .json({ error: { message: "Failed to enable portal access" } });
        }
    }
    static async studentLogin(req, res) {
        try {
            const { regNo, password } = req.body;
            if (!regNo || !password) {
                res
                    .status(400)
                    .json({ error: { message: "RegNo and Password required" } });
                return;
            }
            const normalizedRegNo = String(regNo).trim().toUpperCase();
            const student = await client_2.default.student.findUnique({
                where: { registrationNumber: normalizedRegNo },
            });
            if (!student) {
                res.status(404).json({ error: { message: "Student not found" } });
                return;
            }
            if (!student.portalAuthUserId) {
                res
                    .status(403)
                    .json({
                    error: { message: "Portal access not enabled for this student." },
                });
                return;
            }
            let authEmail = `${normalizedRegNo.toLowerCase()}@students.internal.local`;
            const profile = await client_2.default.profile.findUnique({
                where: { id: student.portalAuthUserId },
            });
            if (profile === null || profile === void 0 ? void 0 : profile.email)
                authEmail = profile.email.toLowerCase();
            const { data, error } = await client_1.supabase.auth.signInWithPassword({
                email: authEmail,
                password: password,
            });
            if (error || !data.session) {
                res.status(401).json({ error: { message: "Invalid credentials" } });
                return;
            }
            res.status(200).json({
                token: data.session.access_token,
                user: {
                    id: student.portalAuthUserId,
                    email: authEmail,
                    role: "STUDENT",
                    fullName: student.fullName,
                    campusScope: student.campusType,
                },
            });
        }
        catch (error) {
            console.error(`StudentController.studentLogin error: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            res.status(500).json({ error: { message: "Internal Login Error" } });
        }
    }
    static async studentForgotPassword(req, res) {
        var _a;
        try {
            const { regNo, verification } = req.body;
            const genericResponse = { message: "If valid, reset instructions sent." };
            const normalizedRegNo = String(regNo || "")
                .trim()
                .toUpperCase();
            const student = await client_2.default.student.findUnique({
                where: { registrationNumber: normalizedRegNo },
            });
            if (!student || !student.portalAuthUserId) {
                return res.status(200).json(genericResponse);
            }
            const verified = !!(student.parentPhone &&
                verification &&
                student.parentPhone.endsWith(String(verification)));
            if (!verified)
                return res.status(200).json(genericResponse);
            const profile = await client_2.default.profile.findUnique({
                where: { id: student.portalAuthUserId },
            });
            const authEmail = (profile === null || profile === void 0 ? void 0 : profile.email) ||
                `${normalizedRegNo.toLowerCase()}@students.internal.local`;
            let deliveryEmail = ADMIN_FALLBACK_EMAIL;
            if (student.parentEmail) {
                const normalizedParentEmail = student.parentEmail.toLowerCase().trim();
                if (isValidEmail(normalizedParentEmail)) {
                    deliveryEmail = normalizedParentEmail;
                }
            }
            const { data, error } = await client_1.supabase.auth.admin.generateLink({
                type: "recovery",
                email: authEmail,
                options: { redirectTo: `${APP_BASE_URL}/auth/callback` },
            });
            if (!error && ((_a = data.properties) === null || _a === void 0 ? void 0 : _a.action_link)) {
                const loginUrl = `${APP_BASE_URL}/login`;
                await emailService_1.EmailService.sendMail(deliveryEmail, "Reset your ERP password", `<p>A password reset was requested for Student Reg No: ${normalizedRegNo}</p>
           <p><a href="${data.properties.action_link}">Reset Password</a></p>
           <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
            }
            else if (error) {
                console.error(`StudentController.studentForgotPassword link error: ${error.message}`);
            }
            return res.status(200).json(genericResponse);
        }
        catch (error) {
            console.error(`StudentController.studentForgotPassword error: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            return res.status(200).json({ message: "If valid, instructions sent." });
        }
    }
    static async resetStudentPassword(req, res) {
        var _a;
        try {
            const { studentId } = req.params;
            const student = await client_2.default.student.findUnique({
                where: { id: studentId },
            });
            if (!student || !student.portalAuthUserId) {
                res
                    .status(404)
                    .json({ error: { message: "Student or Portal Account not found" } });
                return;
            }
            const profile = await client_2.default.profile.findUnique({
                where: { id: student.portalAuthUserId },
            });
            const authEmail = (profile === null || profile === void 0 ? void 0 : profile.email) ||
                `${student.registrationNumber.toLowerCase()}@students.internal.local`;
            let deliveryEmail = ADMIN_FALLBACK_EMAIL;
            if (student.parentEmail) {
                const normalizedParentEmail = student.parentEmail.toLowerCase().trim();
                if (isValidEmail(normalizedParentEmail)) {
                    deliveryEmail = normalizedParentEmail;
                }
            }
            const { data, error } = await client_1.supabase.auth.admin.generateLink({
                type: "recovery",
                email: authEmail,
                options: { redirectTo: `${APP_BASE_URL}/auth/callback` },
            });
            if (error)
                throw error;
            if ((_a = data.properties) === null || _a === void 0 ? void 0 : _a.action_link) {
                const loginUrl = `${APP_BASE_URL}/login`;
                await emailService_1.EmailService.sendMail(deliveryEmail, "Reset your ERP password", `<p>Administrator requested password reset for ${student.fullName} (${student.registrationNumber}).</p>
           <p><a href="${data.properties.action_link}">Reset Password</a></p>
           <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`);
            }
            res.status(200).json({ resetSent: true });
        }
        catch (error) {
            console.error(`StudentController.resetStudentPassword error: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
            res
                .status(500)
                .json({ error: { message: "Failed to reset student password" } });
        }
    }
}
exports.StudentController = StudentController;
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
//# sourceMappingURL=StudentController.js.map