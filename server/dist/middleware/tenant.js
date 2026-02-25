"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTenant = resolveTenant;
const client_1 = require("../infrastructure/supabase/client");
async function resolveTenant(req, res, next) {
    try {
        let subdomain;
        const headerSubdomain = req.headers['x-tenant-subdomain'];
        if (headerSubdomain) {
            subdomain = headerSubdomain;
        }
        else {
            const hostname = req.hostname;
            const parts = hostname.split('.');
            if (hostname === 'localhost' || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                subdomain = 'demo';
            }
            else if (parts.length >= 2) {
                subdomain = parts[0];
            }
        }
        if (!subdomain) {
            res.status(400).json({
                error: {
                    code: 'TENANT_REQUIRED',
                    message: 'Tenant subdomain is required',
                },
            });
            return;
        }
        const { data: tenant, error } = await client_1.supabase
            .from('tenants')
            .select('id, name, subdomain, is_active')
            .eq('subdomain', subdomain)
            .single();
        if (error || !tenant) {
            res.status(404).json({
                error: {
                    code: 'TENANT_NOT_FOUND',
                    message: `Tenant '${subdomain}' not found`,
                },
            });
            return;
        }
        if (!tenant.is_active) {
            res.status(403).json({
                error: {
                    code: 'TENANT_INACTIVE',
                    message: 'Tenant is not active',
                },
            });
            return;
        }
        req.tenant = {
            tenantId: tenant.id,
            subdomain: tenant.subdomain,
            name: tenant.name,
        };
        next();
    }
    catch (error) {
        console.error('Tenant resolution error:', error);
        res.status(500).json({
            error: {
                code: 'TENANT_RESOLUTION_ERROR',
                message: 'Failed to resolve tenant',
            },
        });
    }
}
//# sourceMappingURL=tenant.js.map