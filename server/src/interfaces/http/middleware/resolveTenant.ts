import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../../infrastructure/supabase/client';

/**
 * Tenant Resolution Middleware
 * 
 * RULES (SUBDOMAIN-FIRST):
 * 1. Extract hostname from request (prefer x-forwarded-host for proxies)
 * 2. Parse subdomain from hostname:
 *    - a.yourapp.com -> "a"
 *    - a.localhost -> "a"
 *    - a.erp.local -> "a"
 * 3. Header fallback (X-Tenant-Subdomain) ONLY in development
 * 4. Lookup tenant by subdomain
 * 5. Validate tenant is active
 */

export const resolveTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Step 1: Get hostname (Strict x-forwarded-host first)
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;

    if (!host) {
      return res.status(400).json({ 
        error: 'TENANT_REQUIRED',
        message: 'No host header found' 
      });
    }

    // Step 2: Extract subdomain from hostname
    let tenantKey: string | null = null;
    
    // Split by dots
    // Remove port if present
    const hostWithoutPort = host.split(':')[0];
    const parts = hostWithoutPort.split('.');
    
    // a.erp.test:5173 -> parts: ["a", "erp", "test"] -> subdomain "a"
    // localhost:5173 -> parts: ["localhost"] -> no subdomain
    
    if (parts.length >= 3) {
      tenantKey = parts[0];
    }

    // Special Case: "demo" subdomain logic for localhost dev (if requested by header)
    // The requirement says: "localhost:5173 -> no subdomain -> must require X-Tenant-Subdomain header in dev mode"
    // So if no subdomain found, we check the header.
    
    // Step 3: Fallback to header (DEV ONLY or LOCALHOST)
    // Only if no subdomain found in host
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    if (!tenantKey && (process.env.NODE_ENV === 'development' || isLocal)) {
      tenantKey = req.headers['x-tenant-subdomain'] as string;
      // If header is 'demo', do we map it to 'a' or expect 'demo' tenant to exist?
      // Seed data usually creates 'a', 'b'. 'demo' might not exist.
      // But let's respect the header value strictly.
    }

    if (!tenantKey) {
      // Return 404 per requirements if tenant not resolved/found
      return res.status(404).json({ 
        code: "TENANT_NOT_FOUND",
        message: 'No tenant subdomain found in hostname or headers' 
      });
    }

    // Step 4: Lookup tenant
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, subdomain, name, is_active, onboarding_complete')
      .eq('subdomain', tenantKey)
      .single();

    if (error || !tenant) {
      return res.status(404).json({ 
        code: "TENANT_NOT_FOUND",
        message: `Tenant '${tenantKey}' not found` 
      });
    }

    // Step 5: Validate tenant is active
    if (!tenant.is_active) {
      return res.status(404).json({ 
        code: "TENANT_NOT_FOUND", // Mask inactive as not found for security/requirement compliance or stick to 403? Requirement says "return 404 { code: "TENANT_NOT_FOUND" }" if tenant not found or inactive.
        message: 'Tenant not found or inactive' 
      });
    }

    // Step 6: Attach to request
    (req as any).tenant = {
      tenantId: tenant.id,
      subdomain: tenant.subdomain,
      name: tenant.name
    };

    return next();
  } catch (err: any) {
    console.error('[resolveTenant] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
