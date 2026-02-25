import { Request, Response } from 'express';
import { supabase } from '../../../infrastructure/supabase/client';

/**
 * GET /api/tenant/me
 * Returns tenant info, user profile, accessible campuses, and enabled features
 */
export async function getTenantMe(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    const user = (req as any).user;

    if (!tenant || !user) {
      res.status(500).json({
        error: {
          code: 'MIDDLEWARE_ERROR',
          message: 'Tenant or user not resolved',
        },
      });
      return;
    }

    // 1. Get campuses user can access
    let campusesUserCanAccess: any[] = [];

    // Fallback if tenantId in profile is missing/mismatch?
    // profile.tenantId should match tenant.tenantId enforced by requireAuth.
    
    // Explicitly cast user to any to access allCampusesAccess which might not be on the Type definition yet
    const hasAllAccess = (user as any).allCampusesAccess === true;

    if (hasAllAccess) {
      // User has access to all campuses in the tenant
      const { data: allCampuses, error: campusError } = await supabase
        .from('campuses')
        .select('id, name, campus_type, is_active')
        .eq('tenant_id', tenant.tenantId)
        .eq('is_active', true);

      if (campusError) throw campusError;
      campusesUserCanAccess = allCampuses || [];
    } else {
      // Get explicit campus access
      // Note: We need to join properly. Supabase JS client syntax for joining:
      const { data: accessRecords, error: accessError } = await supabase
        .from('user_campus_access')
        .select(`
          campus_id,
          campuses!inner (
            id,
            name,
            campus_type,
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('tenant_id', tenant.tenantId)
        .eq('campuses.is_active', true); 

      if (accessError) throw accessError;

      campusesUserCanAccess = (accessRecords || [])
        .map((record: any) => record.campuses);
    }

    // 2. Get enabled features for tenant
    const { data: features, error: featuresError } = await supabase
      .from('tenant_features')
      .select('feature_key')
      .eq('tenant_id', tenant.tenantId)
      .eq('enabled', true);

    if (featuresError) {
       console.error('Feature fetch error:', featuresError);
       // Don't crash entire response for features
    }

    const featuresList = (features || []).map((f: any) => ({ feature_key: f.feature_key, enabled: true }));

    const campuses = (campusesUserCanAccess || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      campus_type: c.campus_type || c.campusType,
      is_active: c.is_active ?? c.isActive ?? true,
    }));

    res.json({
      tenant: { id: tenant.tenantId, name: tenant.name, subdomain: tenant.subdomain },
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        all_campuses_access: user.allCampusesAccess,
        allCampusesAccess: user.allCampusesAccess,
      },
      campuses,
      campusesUserCanAccess: campuses,
      features: featuresList,
      featuresEnabled: featuresList.map((f: any) => f.feature_key),
    });
    return; // Ensure return
  } catch (error) {
    console.error('Get tenant/me error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch tenant information',
      },
    });
    return; // Ensure return
  }
}

/**
 * GET /api/tenant/campuses
 * ADMIN only - Returns all campuses for tenant
 */
export async function getCampuses(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      res.status(500).json({
        error: {
          code: 'MIDDLEWARE_ERROR',
          message: 'Tenant not resolved',
        },
      });
      return;
    }

    const { data: campuses, error } = await supabase
      .from('campuses')
      .select('*')
      .eq('tenant_id', tenant.tenantId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ campuses: campuses || [] });
  } catch (error) {
    console.error('Get campuses error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch campuses',
      },
    });
  }
}

/**
 * POST /api/tenant/campuses
 * ADMIN only - Create new campus
 */
export async function createCampus(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
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

    const { data: campus, error } = await supabase
      .from('campuses')
      .insert({
        tenant_id: tenant.tenantId,
        name,
        campus_type,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation
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
  } catch (error) {
    console.error('Create campus error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create campus',
      },
    });
  }
}

/**
 * PATCH /api/tenant/features
 * ADMIN only - Update feature flags
 */
export async function updateFeatures(req: Request, res: Response): Promise<void> {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
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

    // Validate each feature
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

    // Upsert features
    const featuresToUpsert = features.map((f: any) => ({
      tenant_id: tenant.tenantId,
      feature_key: f.feature_key,
      enabled: f.enabled,
    }));

    const { data, error } = await supabase
      .from('tenant_features')
      .upsert(featuresToUpsert, { onConflict: 'tenant_id,feature_key' })
      .select();

    if (error) throw error;

    res.json({ features: data || [] });
  } catch (error) {
    console.error('Update features error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update features',
      },
    });
  }
}
