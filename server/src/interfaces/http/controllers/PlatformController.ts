import { Request, Response } from 'express';
import { PlatformService } from '../../../services/PlatformService';
import { supabase } from '../../../infrastructure/supabase/client';

/**
 * Platform Controller
 * Handles all platform admin operations
 * 
 * All endpoints require requireSuperAdmin middleware
 * All mutations write to platform_audit_logs
 */

export class PlatformController {
  /**
   * GET /api/platform/tenants
   * List all tenants with first admin details
   */
  static async listTenants(_req: Request, res: Response) {
    try {
      const { data: tenants, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get campuses and first admin details separately
      const tenantsWithDetails = await Promise.all(
        (tenants || []).map(async (tenant: any) => {
          // Get campuses
          const { data: campuses } = await supabase
            .from('campuses')
            .select('id')
            .eq('tenant_id', tenant.id);

          // Get first admin email
          let first_admin_email = null;
          if (tenant.first_admin_id) {
            const { data: admin } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', tenant.first_admin_id)
              .single();
            first_admin_email = admin?.email || null;
          }

          return {
            ...tenant,
            campuses: campuses || [],
            first_admin_email,
          };
        })
      );

      return res.json({ data: tenantsWithDetails });
    } catch (error: any) {
      console.error('[PlatformController] listTenants error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants
   * Create a new tenant
   */
  static async createTenant(req: Request, res: Response) {
    try {
      const { name, subdomain } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!name || !subdomain) {
        return res.status(400).json({ error: 'Name and subdomain are required' });
      }

      const tenant = await PlatformService.createTenant(name, subdomain, actorId);

      return res.status(201).json({ data: tenant });
    } catch (error: any) {
      console.error('[PlatformController] createTenant error:', error);
      
      if (error.code === 'SUBDOMAIN_EXISTS') {
        return res.status(409).json({ error: error.message, code: error.code });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/platform/tenants/:tenantId
   * Update tenant
   */
  static async updateTenant(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { name, is_active } = req.body;
      const actorId = (req as any).platformUser.id;

      // Get current state for audit
      const { data: before } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (!before) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      // Update
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data: tenant, error } = await supabase
        .from('tenants')
        .update(updates)
        .eq('id', tenantId)
        .select()
        .single();

      if (error) throw error;

      // Log audit
      const { AuditLogger } = await import('../../../services/AuditLogger');
      await AuditLogger.logAction({
        actorId,
        action: 'UPDATE_TENANT',
        targetType: 'tenant',
        targetId: tenantId,
        tenantId,
        before,
        after: tenant
      });

      return res.json({ data: tenant });
    } catch (error: any) {
      console.error('[PlatformController] updateTenant error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/tenants/:tenantId/campuses
   * List campuses for a tenant
   */
  static async listCampuses(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;

      const { data: campuses, error } = await supabase
        .from('campuses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return res.json({ data: campuses });
    } catch (error: any) {
      console.error('[PlatformController] listCampuses error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/campuses
   * Create a campus for a tenant
   */
  static async createCampus(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { name, campus_type } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!name || !campus_type) {
        return res.status(400).json({ error: 'Name and campus_type are required' });
      }

      if (!['SCHOOL', 'PU'].includes(campus_type)) {
        return res.status(400).json({ error: 'campus_type must be SCHOOL or PU' });
      }

      const campus = await PlatformService.createCampus(tenantId, name, campus_type, actorId);

      return res.status(201).json({ data: campus });
    } catch (error: any) {
      console.error('[PlatformController] createCampus error:', error);
      
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/platform/campuses/:campusId
   * Update a campus
   */
  static async updateCampus(req: Request, res: Response) {
    try {
      const { campusId } = req.params;
      const { name, is_active } = req.body;
      const actorId = (req as any).platformUser.id;

      // Get current state
      const { data: before } = await supabase
        .from('campuses')
        .select('*')
        .eq('id', campusId)
        .single();

      if (!before) {
        return res.status(404).json({ error: 'Campus not found' });
      }

      // Update
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data: campus, error } = await supabase
        .from('campuses')
        .update(updates)
        .eq('id', campusId)
        .select()
        .single();

      if (error) throw error;

      // Log audit
      const { AuditLogger } = await import('../../../services/AuditLogger');
      await AuditLogger.logAction({
        actorId,
        action: 'UPDATE_CAMPUS',
        targetType: 'campus',
        targetId: campusId,
        tenantId: campus.tenant_id,
        campusId,
        before,
        after: campus
      });

      return res.json({ data: campus });
    } catch (error: any) {
      console.error('[PlatformController] updateCampus error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/first-admin
   * Create the first admin for a tenant
   */
  static async createFirstAdmin(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { email, full_name, sendInvite = true } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!email || !full_name) {
        return res.status(400).json({ error: 'Email and full_name are required' });
      }

      const result = await PlatformService.createFirstAdmin(
        tenantId,
        email,
        full_name,
        actorId,
        sendInvite
      );

      return res.status(201).json({ data: result });
    } catch (error: any) {
      console.error('[PlatformController] createFirstAdmin error:', error);
      
      if (error.code === 'EMAIL_IS_PLATFORM' || error.code === 'EMAIL_IN_USE') {
        return res.status(409).json({ error: error.message, code: error.code });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/tenants/:tenantId/features
   * List features for a tenant
   */
  static async listFeatures(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;

      const { data: features, error } = await supabase
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) throw error;

      return res.json({ data: features || [] });
    } catch (error: any) {
      console.error('[PlatformController] listFeatures error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * PATCH /api/platform/tenants/:tenantId/features
   * Update tenant features
   */
  static async updateFeatures(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const features = req.body;
      const actorId = (req as any).platformUser.id;

      if (!Array.isArray(features)) {
        return res.status(400).json({ error: 'Features must be an array' });
      }

      await PlatformService.updateTenantFeatures(tenantId, features, actorId);

      // Return updated features
      const { data: updatedFeatures } = await supabase
        .from('tenant_features')
        .select('*')
        .eq('tenant_id', tenantId);

      return res.json({ data: updatedFeatures });
    } catch (error: any) {
      console.error('[PlatformController] updateFeatures error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/finalize
   * Finalize tenant onboarding
   */
  static async finalizeOnboarding(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const actorId = (req as any).platformUser.id;

      const result = await PlatformService.finalizeTenantOnboarding(tenantId, actorId);

      return res.json({ data: result });
    } catch (error: any) {
      console.error('[PlatformController] finalizeOnboarding error:', error);
      
      if (error.code === 'NO_CAMPUSES' || error.code === 'NO_ADMINS' || error.code === 'MISSING_FEATURES') {
        return res.status(400).json({ error: error.message, code: error.code });
      }

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/users/:userId/resend-invite
   * Resend invite to a user
   */
  static async resendInvite(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const result = await PlatformService.resendInvite(userId);

      return res.json({ data: result });
    } catch (error: any) {
      console.error('[PlatformController] resendInvite error:', error);
      
      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/me
   * Get current platform user info
   */
  static async getMe(req: Request, res: Response) {
    try {
      const platformUser = (req as any).platformUser;
      return res.json({ data: platformUser });
    } catch (error: any) {
      console.error('[PlatformController] getMe error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/finalize
   * Finalize tenant onboarding
   */
  static async finalizeTenant(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const actorId = (req as any).platformUser.id;

      const result = await PlatformService.finalizeTenantOnboarding(tenantId, actorId);
      return res.json({ data: result });
    } catch (error: any) {
      console.error('[PlatformController] finalizeTenant error:', error);

      if (error.code === 'NO_CAMPUSES' || error.code === 'NO_ADMINS' || error.code === 'MISSING_FEATURES') {
        return res.status(400).json({ error: error.message, code: error.code });
      }

      if (error.statusCode === 404) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/platform/tenants/:tenantId/users
   * List users for a tenant
   */
  static async listTenantUsers(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;

      const users = await PlatformService.listTenantUsers(tenantId);
      return res.json({ data: users });
    } catch (error: any) {
      console.error('[PlatformController] listTenantUsers error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/tenants/:tenantId/users
   * Provision a user to a tenant
   */
  static async provisionTenantUser(req: Request, res: Response) {
    try {
      const { tenantId } = req.params;
      const { email, full_name, role, sendInvite = true } = req.body;
      const actorId = (req as any).platformUser.id;

      if (!email || !full_name || !role) {
        return res.status(400).json({ error: 'Email, full_name, and role are required' });
      }

      const result = await PlatformService.provisionTenantUser(
        tenantId,
        email,
        full_name,
        role,
        actorId,
        sendInvite
      );

      return res.status(201).json({ data: result });
    } catch (error: any) {
      console.error('[PlatformController] provisionTenantUser error:', error);

      if (error.code === 'EMAIL_IS_PLATFORM' || error.code === 'EMAIL_IN_USE') {
        return res.status(409).json({ error: error.message, code: error.code });
      }

      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/platform/impersonate
   * Create an impersonation session for a user
   */
  static async impersonate(req: Request, res: Response) {
    try {
      const { tenantId, userId } = req.body;

      if (!tenantId || !userId) {
        return res.status(400).json({ error: 'tenantId and userId are required' });
      }

      // Verify user exists in this tenant
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, tenant_id')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .single();

      if (profileError || !profile) {
        return res.status(404).json({ error: 'User not found in this tenant' });
      }

      // Generate a magic link for impersonation
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: profile.email
      });

      if (linkError) throw linkError;

      const impersonationUrl = linkData.properties.action_link;

      return res.json({ data: { impersonation_url: impersonationUrl } });
    } catch (error: any) {
      console.error('[PlatformController] impersonate error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
