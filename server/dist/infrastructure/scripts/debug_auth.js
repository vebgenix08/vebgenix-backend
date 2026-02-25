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
async function debugAuth() {
    const email = process.env.SEED_ADMIN_EMAIL;
    console.log('🔍 Debugging Auth for:', email);
    const { data: { users }, error } = await client_1.supabase.auth.admin.listUsers();
    if (error) {
        console.error('❌ Error listing users:', error.message);
        return;
    }
    const user = users.find(u => u.email === email);
    if (!user) {
        console.error('❌ User NOT FOUND in Supabase Auth!');
    }
    else {
        console.log('✅ User FOUND in Supabase Auth:', user.id);
        console.log('   Confirmed:', user.email_confirmed_at ? 'YES' : 'NO');
        console.log('   Last Sign In:', user.last_sign_in_at);
        console.log('🔄 Attempting force password update...');
        const { error: updateError } = await client_1.supabase.auth.admin.updateUserById(user.id, {
            password: process.env.SEED_ADMIN_PASSWORD,
            email_confirm: true
        });
        if (updateError)
            console.error('❌ Password Update Failed:', updateError.message);
        else
            console.log('✅ Password Force Updated to env value.');
    }
}
debugAuth();
//# sourceMappingURL=debug_auth.js.map