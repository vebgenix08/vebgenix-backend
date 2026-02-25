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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const emailService_1 = require("../services/emailService");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const envPath = path_1.default.resolve(__dirname, '../../../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });
async function testEmail() {
    const targetEmail = process.argv[2];
    if (!targetEmail) {
        console.error("Usage: npx ts-node src/infrastructure/scripts/test_email.ts <email>");
        process.exit(1);
    }
    console.log("Testing Email Service...");
    console.log("SMTP Host:", process.env.SMTP_HOST || "NOT SET");
    console.log("SMTP User:", process.env.SMTP_USER || process.env.SMTP_EMAIL || "NOT SET");
    await emailService_1.EmailService.sendMail(targetEmail, "Test Email from Vagentix", "<h1>Test Email</h1><p>This is a test email to verify SMTP configuration.</p>");
}
testEmail();
//# sourceMappingURL=test_email.js.map