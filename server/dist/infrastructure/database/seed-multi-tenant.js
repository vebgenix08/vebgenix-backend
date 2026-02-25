"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedMultiTenant = seedMultiTenant;
const client_1 = require("../supabase/client");
async function seedMultiTenant() {
    console.log('🌱 Seeding multi-tenant data...');
    try {
        const { data: tenant, error: tenantError } = await client_1.supabase
            .from('tenants')
            .upsert({
            name: 'Demo School System',
            subdomain: 'demo',
            is_active: true,
        }, { onConflict: 'subdomain' })
            .select()
            .single();
        if (tenantError)
            throw tenantError;
        console.log(`✅ Tenant created: ${tenant.name} (${tenant.subdomain})`);
        const campuses = [
            { tenant_id: tenant.id, name: 'School 1', campus_type: 'SCHOOL', is_active: true },
            { tenant_id: tenant.id, name: 'College', campus_type: 'PU', is_active: true },
        ];
        const { data: createdCampuses, error: campusError } = await client_1.supabase
            .from('campuses')
            .upsert(campuses, { onConflict: 'tenant_id,name' })
            .select();
        if (campusError)
            throw campusError;
        console.log(`✅ Campuses created: ${createdCampuses.length}`);
        const defaultCampus = createdCampuses[0];
        const { error: enquiriesError } = await client_1.supabase
            .from('enquiries')
            .update({ tenant_id: tenant.id, campus_id: defaultCampus.id })
            .is('tenant_id', null);
        if (enquiriesError)
            console.warn('Enquiries backfill:', enquiriesError.message);
        const { error: applicationsError } = await client_1.supabase
            .from('applications')
            .update({ tenant_id: tenant.id, campus_id: defaultCampus.id })
            .is('tenant_id', null);
        if (applicationsError)
            console.warn('Applications backfill:', applicationsError.message);
        const { error: studentsError } = await client_1.supabase
            .from('students')
            .update({ tenant_id: tenant.id, campus_id: defaultCampus.id })
            .is('tenant_id', null);
        if (studentsError)
            console.warn('Students backfill:', studentsError.message);
        console.log('✅ Backfilled existing admissions data');
        const features = [
            { tenant_id: tenant.id, feature_key: 'ADMISSIONS', enabled: true },
            { tenant_id: tenant.id, feature_key: 'DASHBOARD', enabled: true },
            { tenant_id: tenant.id, feature_key: 'STUDENTS', enabled: true },
            { tenant_id: tenant.id, feature_key: 'ACADEMICS', enabled: true },
            { tenant_id: tenant.id, feature_key: 'ATTENDANCE', enabled: true },
        ];
        const { error: featuresError } = await client_1.supabase
            .from('tenant_features')
            .upsert(features, { onConflict: 'tenant_id,feature_key' });
        if (featuresError)
            throw featuresError;
        console.log(`✅ Features enabled: ${features.length}`);
        const { data: existingProfiles } = await client_1.supabase
            .from('profiles')
            .select('*')
            .eq('role', 'ADMIN')
            .limit(1);
        if (existingProfiles && existingProfiles.length > 0) {
            const { error: profileError } = await client_1.supabase
                .from('profiles')
                .update({
                tenant_id: tenant.id,
                all_campuses_access: true,
            })
                .eq('id', existingProfiles[0].id);
            if (profileError)
                console.warn('Profile update:', profileError.message);
            console.log('✅ Admin profile updated with tenant access');
            const campusAccess = createdCampuses.map((campus) => ({
                tenant_id: tenant.id,
                user_id: existingProfiles[0].id,
                campus_id: campus.id,
            }));
            const { error: accessError } = await client_1.supabase
                .from('user_campus_access')
                .upsert(campusAccess, { onConflict: 'user_id,campus_id' });
            if (accessError)
                console.warn('Campus access:', accessError.message);
            console.log('✅ Campus access granted to admin');
        }
        console.log('🎉 Multi-tenant seed completed successfully!');
        return { tenant, campuses: createdCampuses };
    }
    catch (error) {
        console.error('❌ Seed failed:', error);
        throw error;
    }
}
if (require.main === module) {
    seedMultiTenant()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
//# sourceMappingURL=seed-multi-tenant.js.map