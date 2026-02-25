"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCampusAccess = requireCampusAccess;
const client_1 = require("../infrastructure/supabase/client");
async function requireCampusAccess(req, res, next) {
    try {
        if (!req.tenant) {
            res.status(500).json({
                error: {
                    code: 'TENANT_MISSING',
                    message: 'Tenant not resolved. Ensure resolveTenant middleware runs first.',
                },
            });
            return;
        }
        if (!req.user) {
            res.status(500).json({
                error: {
                    code: 'USER_MISSING',
                    message: 'User not authenticated. Ensure requireAuth middleware runs first.',
                },
            });
            return;
        }
        const campusId = req.headers['x-campus-id'];
        if (!campusId) {
            res.status(400).json({
                error: {
                    code: 'CAMPUS_ID_REQUIRED',
                    message: 'X-Campus-Id header is required for this endpoint',
                },
            });
            return;
        }
        const { data: campus, error: campusError } = await client_1.supabase
            .from('campuses')
            .select('id, name, campus_type, is_active')
            .eq('id', campusId)
            .eq('tenant_id', req.tenant.tenantId)
            .single();
        if (campusError || !campus) {
            res.status(404).json({
                error: {
                    code: 'CAMPUS_NOT_FOUND',
                    message: 'Campus not found or does not belong to this tenant',
                },
            });
            return;
        }
        if (!campus.is_active) {
            res.status(403).json({
                error: {
                    code: 'CAMPUS_INACTIVE',
                    message: 'Campus is not active',
                },
            });
            return;
        }
        if (!req.user.allCampusesAccess) {
            const { data: access, error: accessError } = await client_1.supabase
                .from('user_campus_access')
                .select('id')
                .eq('user_id', req.user.id)
                .eq('campus_id', campusId)
                .single();
            if (accessError || !access) {
                res.status(403).json({
                    error: {
                        code: 'CAMPUS_ACCESS_DENIED',
                        message: 'You do not have access to this campus',
                    },
                });
                return;
            }
        }
        req.campus = {
            campusId: campus.id,
            campusType: campus.campus_type,
            name: campus.name,
        };
        next();
    }
    catch (error) {
        console.error('Campus access error:', error);
        res.status(500).json({
            error: {
                code: 'CAMPUS_ACCESS_ERROR',
                message: 'Failed to validate campus access',
            },
        });
    }
}
//# sourceMappingURL=campus.js.map