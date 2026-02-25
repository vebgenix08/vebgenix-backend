"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class EmailService {
    static async sendMail(to, subject, body) {
        console.log(`\n--- [EMAIL SEND ATTEMPT] ---`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        const smtpHost = process.env.SMTP_HOST;
        const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
        const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_APP_PASSWORD;
        const smtpPort = Number(process.env.SMTP_PORT) || 587;
        if (!smtpHost || !smtpUser || !smtpPass) {
            console.warn("⚠️ SMTP Configuration missing (SMTP_HOST, SMTP_USER/EMAIL, SMTP_PASSWORD/APP_PASSWORD). Email will ONLY be logged to console.");
            console.log(`Body (Snippet): ${body.substring(0, 500)}...`);
            console.log(`-------------------------\n`);
            return;
        }
        try {
            const transporter = nodemailer_1.default.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: {
                    user: smtpUser,
                    pass: smtpPass,
                },
            });
            await transporter.sendMail({
                from: `"${process.env.APP_NAME || 'Vagentix'}" <${smtpUser}>`,
                to,
                subject,
                html: body,
            });
            console.log("✅ Email sent successfully via SMTP.");
        }
        catch (error) {
            console.error("❌ Failed to send email via SMTP:", error);
            console.log(`Body (Snippet): ${body.substring(0, 500)}...`);
        }
        console.log(`-------------------------\n`);
    }
}
exports.EmailService = EmailService;
//# sourceMappingURL=emailService.js.map