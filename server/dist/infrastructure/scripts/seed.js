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
const seed = async () => {
    console.log('🌱 Starting Seed Script...');
    const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
    const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.error('❌ Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD in .env');
        process.exit(1);
    }
    try {
        console.log(`Checking Auth User: ${ADMIN_EMAIL}...`);
        let userId = null;
        const { data: { users }, error: listError } = await client_1.supabase.auth.admin.listUsers();
        if (listError)
            throw new Error(`List Users Failed: ${listError.message}`);
        const existingUser = users.find(u => u.email === ADMIN_EMAIL);
        if (existingUser) {
            console.log('✅ Auth user already exists.');
            userId = existingUser.id;
        }
        else {
            console.log('Creating new Auth user...');
            const { data: newUser, error: createError } = await client_1.supabase.auth.admin.createUser({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                email_confirm: true,
                user_metadata: { full_name: 'System Admin', role: 'ADMIN' }
            });
            if (createError)
                throw new Error(`Create User Failed: ${createError.message}`);
            userId = newUser.user.id;
            console.log('✅ Auth user created.');
        }
        if (!userId)
            throw new Error('Failed to resolve User ID');
        console.log('Upserting Admin Profile...');
        await client_2.default.profile.upsert({
            where: { id: userId },
            update: {
                role: 'ADMIN',
                campusScope: null,
                isActive: true,
                fullName: 'System Admin'
            },
            create: {
                id: userId,
                email: ADMIN_EMAIL,
                role: 'ADMIN',
                campusScope: null,
                isActive: true,
                fullName: 'System Admin'
            }
        });
        console.log('✅ Admin Profile synced.');
        console.log('Seeding Sample Enquiries...');
        const result = await client_2.default.enquiry.createMany({
            data: [
                {
                    fullName: 'Suresh Kumar',
                    email: 'suresh@example.com',
                    phone: '9876543210',
                    gradeApplied: '1 PUC',
                    status: 'NEW',
                    campusScope: 'PU',
                    notes: 'Interested in Science stream'
                },
                {
                    fullName: 'Anita Raj',
                    email: 'anita@example.com',
                    phone: '9876543211',
                    gradeApplied: '5th Std',
                    status: 'CONTACTED',
                    campusScope: 'SCHOOL',
                    notes: 'Sibling discount output'
                }
            ],
            skipDuplicates: true
        });
        console.log(`✅ Seeded ${result.count} Enquiries.`);
        console.log('🎉 Seeding Complete!');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Seed Failed:', error);
        process.exit(1);
    }
};
seed();
//# sourceMappingURL=seed.js.map