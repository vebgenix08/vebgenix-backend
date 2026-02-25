"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantMe = getTenantMe;
exports.getCampuses = getCampuses;
exports.createCampus = createCampus;
exports.updateFeatures = updateFeatures;
const client_1 = require("../../../infrastructure/supabase/client");
async function getTenantMe(req, res) {
    try {
        if (!req.tenant || !req.user) {
            res.status(500).json({
                error: {
                    code: 'MIDDLEWARE_ERROR',
                    message: 'Tenant or user not resolved',
                },
            });
            return;
        }
        let campusesUserCanAccess = [];
        if (req.user.allCampusesAccess) {
            const { data: allCampuses, error: campusError } = await client_1.supabase
                .from('campuses')
                .select('id, name, campus_type, is_active')
                .eq('tenant_id', req.tenant.tenantId)
                .eq('is_active', true);
            if (campusError)
                throw campusError;
            campusesUserCanAccess = allCampuses || [];
        }
        else {
            const { data: accessRecords, error: accessError } = await client_1.supabase
                .from('user_campus_access')
                .select(`
          campus_id,
          campuses (
            id,
            name,
            campus_type,
            is_active
          )
        `)
                .eq('user_id', req.user.id)
                .eq('tenant_id', req.tenant.tenantId);
            if (accessError)
                throw accessError;
            campusesUserCanAccess = (accessRecords || [])
                .map((record) => record.campuses)
                .filter((campus) => campus && campus.is_active);
        }
        const { data: features, error: featuresError } = await client_1.supabase
            .from('tenant_features')
            .select('feature_key')
            .eq('tenant_id', req.tenant.tenantId)
            .eq('enabled', true);
        if (featuresError)
            throw featuresError;
        const featuresEnabled = (features || []).map((f) => f.feature_key);
        res.json({
            tenant: {
                id: req.tenant.tenantId,
                name: req.tenant.name,
                subdomain: req.tenant.subdomain,
            },
            user: {
                id: req.user.id,
                email: req.user.email,
                full_name: req.user.fullName,
                role: req.user.role,
                allCampusesAccess: req.user.allCampusesAccess,
            },
            campusesUserCanAccess,
            featuresEnabled,
        });
    }
    catch (error) {
        console.error('Get tenant/me error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch tenant information',
            },
        });
    }
}
async function getCampuses(req, res) {
    try {
        if (!req.tenant) {
            res.status(500).json({
                error: {
                    code: 'MIDDLEWARE_ERROR',
                    message: 'Tenant not resolved',
                },
            });
            return;
        }
        const { data: campuses, error } = await client_1.supabase
            .from('campuses')
            .select('*')
            .eq('tenant_id', req.tenant.tenantId)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        res.json({ campuses: campuses || [] });
    }
    catch (error) {
        console.error('Get campuses error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch campuses',
            },
        });
    }
}
async function createCampus(req, res) {
    try {
        if (!req.tenant) {
            res.status(500).json({
                error: {
                    code: 'MIDDLEWARE_ERROR',
                    message: 'Tenant not resolved',
                },
            });
            return;
        }
        const { name, campus_type } = req.body;
        if (!name || !campus_type) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'name and campus_type are required',
                },
            });
            return;
        }
        if (!['SCHOOL', 'PU'].includes(campus_type)) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'campus_type must be SCHOOL or PU',
                },
            });
            return;
        }
        const { data: campus, error } = await client_1.supabase
            .from('campuses')
            .insert({
            tenant_id: req.tenant.tenantId,
            name,
            campus_type,
            is_active: true,
        })
            .select()
            .single();
        if (error) {
            if (error.code === '23505') {
                res.status(409).json({
                    error: {
                        code: 'CAMPUS_EXISTS',
                        message: 'A campus with this name already exists',
                    },
                });
                return;
            }
            throw error;
        }
        res.status(201).json({ campus });
    }
    catch (error) {
        console.error('Create campus error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to create campus',
            },
        });
    }
}
async function updateFeatures(req, res) {
    try {
        if (!req.tenant) {
            res.status(500).json({
                error: {
                    code: 'MIDDLEWARE_ERROR',
                    message: 'Tenant not resolved',
                },
            });
            return;
        }
        const features = req.body;
        if (!Array.isArray(features)) {
            res.status(400).json({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request body must be an array of { feature_key, enabled }',
                },
            });
            return;
        }
        for (const feature of features) {
            if (!feature.feature_key || typeof feature.enabled !== 'boolean') {
                res.status(400).json({
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Each feature must have feature_key (string) and enabled (boolean)',
                    },
                });
                return;
            }
        }
        const featuresToUpsert = features.map((f) => ({
            tenant_id: req.tenant.tenantId,
            feature_key: f.feature_key,
            enabled: f.enabled,
        }));
        const { data, error } = await client_1.supabase
            .from('tenant_features')
            .upsert(featuresToUpsert, { onConflict: 'tenant_id,feature_key' })
            .select();
        if (error)
            throw error;
        res.json({ features: data || [] });
    }
    catch (error) {
        console.error('Update features error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to update features',
            },
        });
    }
}
//# sourceMappingURL=TenantController.js.map