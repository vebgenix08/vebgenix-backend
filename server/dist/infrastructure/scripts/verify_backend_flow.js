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
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../../../../.env') });
const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
async function verifyFlow() {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    console.log('🔍 Verifying Backend Flow...');
    console.log(`   Target: ${BASE_URL}`);
    console.log(`   Email: ${email}`);
    console.log('👉 1. Attempting Supabase Login...');
    const { data, error } = await client_1.supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) {
        console.error('❌ Supabase Login Failed:', error.message);
        process.exit(1);
    }
    console.log('✅ Supabase Login Success.');
    const token = data.session.access_token;
    console.log('👉 2. Calling GET /api/me with token...');
    try {
        const res = await fetch(`${BASE_URL}/api/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log(`   Status: ${res.status} ${res.statusText}`);
        const body = await res.text();
        try {
            const json = JSON.parse(body);
            console.log('   Response:', JSON.stringify(json, null, 2));
        }
        catch (_a) {
            console.log('   Body (text):', body);
        }
        if (!res.ok) {
            console.error('❌ Backend Profile Fetch Failed');
            process.exit(1);
        }
        console.log('✅ Backend Profile Fetch Success!');
    }
    catch (err) {
        console.error('❌ Network Error calling API:', err.message);
        process.exit(1);
    }
}
verifyFlow();
//# sourceMappingURL=verify_backend_flow.js.map