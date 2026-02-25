"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURES = void 0;
exports.requireFeature = requireFeature;
const client_1 = require("../infrastructure/supabase/client");
function requireFeature(featureKey) {
    return async (req, res, next) => {
        try {
            if (!req.tenant) {
                res.status(500).json({
                    error: {
                        code: 'TENANT_MISSING',
                        message: 'Tenant not resolved',
                    },
                });
                return;
            }
            const { data: feature, error } = await client_1.supabase
                .from('tenant_features')
                .select('enabled')
                .eq('tenant_id', req.tenant.tenantId)
                .eq('feature_key', featureKey)
                .single();
            if (error || !feature || !feature.enabled) {
                res.status(404).json({
                    error: {
                        code: 'FEATURE_NOT_AVAILABLE',
                        message: `Feature '${featureKey}' is not available for this tenant`,
                    },
                });
                return;
            }
            next();
        }
        catch (error) {
            console.error('Feature check error:', error);
            res.status(500).json({
                error: {
                    code: 'FEATURE_CHECK_ERROR',
                    message: 'Failed to check feature availability',
                },
            });
        }
    };
}
exports.FEATURES = {
    ADMISSIONS: 'ADMISSIONS',
    DASHBOARD: 'DASHBOARD',
    STUDENTS: 'STUDENTS',
    ACADEMICS: 'ACADEMICS',
    ATTENDANCE: 'ATTENDANCE',
    FINANCE: 'FINANCE',
    HR: 'HR',
    EXAMS: 'EXAMS',
    CERTIFICATES: 'CERTIFICATES',
    COMMUNICATION: 'COMMUNICATION',
    REPORTS: 'REPORTS',
    HOSTEL: 'HOSTEL',
    TRANSPORT: 'TRANSPORT',
    LIBRARY: 'LIBRARY',
};
//# sourceMappingURL=feature.js.map