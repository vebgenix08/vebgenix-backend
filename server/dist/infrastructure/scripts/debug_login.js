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
const client_1 = require("../supabase/client");
const client_2 = __importDefault(require("../prisma/client"));
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../../../../.env') });
async function debugLogin() {
    const email = process.env.SEED_ADMIN_EMAIL || 'admin@university.edu';
    const password = process.env.SEED_ADMIN_PASSWORD;
    console.log(`🔍 1. Attempting Login for ${email}...`);
    try {
        const { data, error } = await client_1.supabase.auth.signInWithPassword({
            email,
            password: password || 'default'
        });
        if (error) {
            console.error('❌ Login Failed:', error.message);
            return;
        }
        if (!data.session) {
            console.error('❌ No Session Returned');
            return;
        }
        console.log('✅ Supabase Login Successful.');
        console.log('   User ID:', data.user.id);
        const token = data.session.access_token;
        console.log('\n🔍 2. Verifying Token (getUser)...');
        const { data: userData, error: userError } = await client_1.supabase.auth.getUser(token);
        if (userError || !userData.user) {
            console.error('❌ getUser Failed:', userError === null || userError === void 0 ? void 0 : userError.message);
            return;
        }
        console.log('✅ Token Verified.');
        console.log('\n🔍 3. Fetching Prisma Profile...');
        const profile = await client_2.default.profile.findUnique({
            where: { id: data.user.id }
        });
        if (!profile) {
            console.error('❌ Profile NOT FOUND in DB');
        }
        else {
            console.log('✅ Profile Found:', profile.fullName, `(Active: ${profile.isActive})`);
        }
    }
    catch (err) {
        console.error('❌ Unexpected Error in Script:', err.message);
        console.error(err);
    }
    finally {
        await client_2.default.$disconnect();
    }
}
debugLogin();
//# sourceMappingURL=debug_login.js.map