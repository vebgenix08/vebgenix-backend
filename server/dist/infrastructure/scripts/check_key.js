"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
console.log('Key length:', key.length);
console.log('Key start:', key.substring(0, 10));
if (key.includes('.')) {
    try {
        const payload = JSON.parse(atob(key.split('.')[1]));
        console.log('JWT Role:', payload.role);
        console.log('JWT Iss:', payload.iss);
    }
    catch (e) {
        console.error('Failed to decode JWT:', e);
    }
}
else {
    console.log('Key does not look like a JWT (no dots).');
}
//# sourceMappingURL=check_key.js.map