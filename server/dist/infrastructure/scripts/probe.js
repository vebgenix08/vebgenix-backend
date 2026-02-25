"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../supabase/client");
const probe = async () => {
    console.log('🕵️ Starting Supabase Probe...');
    console.log('Checking URL:', process.env.SUPABASE_URL ? '✅ Loaded' : '❌ Missing');
    console.log('Checking Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Loaded' : '❌ Missing');
    try {
        const { data, error } = await client_1.supabase.auth.admin.listUsers();
        if (error) {
            console.error('❌ Auth Check Failed:', error.message);
        }
        else {
            console.log('✅ Auth Check Passed. Users found:', data.users.length);
        }
    }
    catch (err) {
        console.error('❌ Auth Check Exception:', err.message);
    }
    try {
        const { count, error } = await client_1.supabase.from('profiles').select('*', { count: 'exact', head: true });
        if (error) {
            console.error('❌ DB Check (profiles) Failed:', JSON.stringify(error, null, 2));
        }
        else {
            console.log('✅ DB Check (profiles) Passed. Count:', count);
        }
    }
    catch (err) {
        console.error('❌ DB Check Exception:', err.message);
    }
    console.log('🌐 Starting Raw Fetch Probe...');
    try {
        const resp = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=*&limit=1`, {
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Profile': 'public',
                'Accept-Profile': 'public'
            }
        });
        console.log('Status:', resp.status);
        console.log('StatusText:', resp.statusText);
        const text = await resp.text();
        console.log('Body:', text);
    }
    catch (e) {
        console.error('Fetch Failed:', e.message);
    }
};
probe();
//# sourceMappingURL=probe.js.map