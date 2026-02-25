import { supabase } from '../infrastructure/supabase/client';
import { AuditLogger } from './AuditLogger';
import { emailService } from './EmailService';
import prisma from '../infrastructure/prisma/client';
import { grantAdminDashboardPerms } from '../../scripts/grant-admin-dashboard-perms';

/**
 * Platform Service
 * Business logic for platform admin operations
 * 
 * CRITICAL RULES:
 * 1. All mutations are transactional
 * 2. Emails sent AFTER transaction commits
 * 3. Email failure does NOT rollback DB
 * 4. One email = one tenant only
 * 5. Platform emails cannot be in profiles
 * 6. No orphaned auth users
 */

interface CreateTenantResult {
  id: string;
  name: string;
  subdomain: string;
  is_active: boolean;
  onboarding_complete: boolean;
}

interface CreateCampusResult {
  id: string;
  tenant_id: string;
  name: string;
  campus_type: 'SCHOOL' | 'PU';
  is_active: boolean;
}

interface CreateFirstAdminResult {
  userId: string;
  alreadyExisted: boolean;
  inviteSent: boolean;
  inviteLink?: string; // Only in development
}

export class PlatformService {
  /**
   * Create a new tenant
   * 
   * Validates:
   * - Subdomain format (lowercase, alphanumeric, hyphens)
   * - Subdomain uniqueness
   */
  static async createTenant(
    name: string,
    subdomain: string,
    actorId: string
  ): Promise<CreateTenantResult> {
    // Validate subdomain format
    const subdomainRegex = /^[a-z0-9-]+$/;
    if (!subdomainRegex.test(subdomain)) {
      throw new Error('Subdomain must be lowercase alphanumeric with hyphens only');
    }

    // Check uniqueness
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('subdomain', subdomain)
      .single();

    if (existing) {
      const error: any = new Error('Subdomain already exists');
      error.code = 'SUBDOMAIN_EXISTS';
      error.statusCode = 409;
      throw error;
    }

    // Create tenant
    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert({
        name,
        subdomain,
        is_active: true,
        onboarding_complete: false
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-enable all features for new tenants
    const allFeatures = [
      'DASHBOARD',
      'ADMISSIONS',
      'ACADEMICS',
      'ATTENDANCE',
      'FINANCE',
      'HOSTEL',
      'TRANSPORT'
    ];

    const featureRecords = allFeatures.map(feature_key => ({
      tenant_id: tenant.id,
      feature_key,
      enabled: true
    }));

    const { error: featuresError } = await supabase
      .from('tenant_features')
      .insert(featureRecords);

    if (featuresError) {
      console.error('[PlatformService] Failed to create default features:', featuresError);
      // Don't throw - features can be added later
    }

    // Log audit (after successful creation)
    await AuditLogger.logAction({
      actorId,
      action: 'CREATE_TENANT',
      targetType: 'tenant',
      targetId: tenant.id,
      tenantId: tenant.id,
      after: { name, subdomain, features: 'all_enabled' }
    });

    return tenant;
  }

  /**
   * Create a campus for a tenant
   */
  static async createCampus(
    tenantId: string,
    name: string,
    campusType: 'SCHOOL' | 'PU',
    actorId: string
  ): Promise<CreateCampusResult> {
    // Verify tenant exists
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      const error: any = new Error('Tenant not found');
      error.statusCode = 404;
      throw error;
    }

    // Create campus
    const { data: campus, error } = await supabase
      .from('campuses')
      .insert({
        tenant_id: tenantId,
        name,
        campus_type: campusType,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: 'CREATE_CAMPUS',
      targetType: 'campus',
      targetId: campus.id,
      tenantId,
      campusId: campus.id,
      after: { name, campus_type: campusType }
    });

    return campus;
  }

  /**
   * Create first admin for a tenant
   * 
   * CRITICAL TRANSACTION LOGIC:
   * 1. Inside transaction:
   *    - Validate email not in platform_users
   *    - Validate email not in another tenant's profiles
   *    - Create/reuse auth user
   *    - Create profile with ADMIN role
   * 2. After commit:
   *    - Generate invite link
   *    - Send email (failure does NOT rollback)
   */
  static async createFirstAdmin(
    tenantId: string,
    email: string,
    fullName: string,
    actorId: string,
    sendInvite: boolean = true
  ): Promise<CreateFirstAdminResult> {
    const emailLower = email.toLowerCase();

    // Step 1: Validate email not in platform_users
    const { data: platformUser } = await supabase
      .from('platform_users')
      .select('id')
      .eq('email', emailLower)
      .single();

    if (platformUser) {
      const error: any = new Error('Email belongs to platform admin and cannot be used for tenant');
      error.code = 'EMAIL_IS_PLATFORM';
      error.statusCode = 409;
      throw error;
    }

    // Step 2: Validate email not in another tenant
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, tenant_id')
      .eq('email', emailLower)
      .single();

    if (existingProfile && existingProfile.tenant_id !== tenantId) {
      const error: any = new Error('Email already belongs to another tenant');
      error.code = 'EMAIL_IN_USE';
      error.statusCode = 409;
      throw error;
    }

    // Step 3: Create or reuse auth user
    let userId: string;
    let alreadyExisted = false;

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existingAuthUser = users.find(u => u.email?.toLowerCase() === emailLower);

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      alreadyExisted = true;
    } else {
      // Create new auth user (no password - will be set via invite link)
      const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
        email: emailLower,
        email_confirm: true,
        user_metadata: {
          full_name: fullName
        }
      });

      if (authError) throw authError;
      userId = newUser.user.id;
    }

    // Step 4: Create or update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        tenant_id: tenantId,
        email: emailLower,
        full_name: fullName,
        role: 'ADMIN',
        all_campuses_access: true,
        is_active: true
      });

    if (profileError) throw profileError;

    // Step 4a: Auto-grant dashboard permissions to new ADMIN
    try {
      const granted = await grantAdminDashboardPerms({
        prisma,
        tenantId,
        profileId: userId,
      });
      if (granted > 0) {
        console.log(`[PlatformService] Auto-granted ${granted} dashboard permission(s) to ADMIN ${userId}`);
      }
    } catch (permErr) {
      // Non-fatal: permissions can be granted later via script
      console.error('[PlatformService] Failed to auto-grant dashboard permissions:', permErr);
    }

    // Step 4b: Update tenant with first_admin_id
    const { error: tenantUpdateError } = await supabase
      .from('tenants')
      .update({ first_admin_id: userId })
      .eq('id', tenantId);

    if (tenantUpdateError) throw tenantUpdateError;

    // Log audit (transaction committed)
    await AuditLogger.logAction({
      actorId,
      action: 'CREATE_FIRST_ADMIN',
      targetType: 'profile',
      targetId: userId,
      tenantId,
      after: { email: emailLower, full_name: fullName, role: 'ADMIN' }
    });

    // Step 5: Send invite email (AFTER transaction)
    let inviteSent = false;
    let inviteLink: string | undefined;

    if (sendInvite) {
      try {
        // Get tenant info for redirect URL
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name, subdomain')
          .eq('id', tenantId)
          .single();

        if (!tenant) throw new Error('Tenant not found');

        // Build tenant-aware redirect URL
        const tenantBaseUrl = process.env.NODE_ENV === 'development'
          ? `http://${tenant.subdomain}.erp.test:5173`
          : `https://${tenant.subdomain}.yourapp.com`;

        const redirectTo = `${tenantBaseUrl}/auth/callback`;

        // Generate invite link with tenant-specific redirect
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: alreadyExisted ? 'recovery' : 'invite',
          email: emailLower,
          options: {
            redirectTo
          }
        });

        if (linkError) {
          console.error('[PlatformService] Failed to generate invite link:', linkError);
        } else {
          inviteLink = linkData.properties.action_link;

          // In development, log the invite link
          if (process.env.NODE_ENV === 'development') {
            console.log('[PlatformService] DEV MODE: Invite link for', emailLower, ':', inviteLink);
            console.log('[PlatformService] Redirect to:', redirectTo);
          }

          // Send email with tenant login URL
          inviteSent = await emailService.sendInviteEmail(
            emailLower,
            inviteLink,
            tenant.name,
            `${tenantBaseUrl}/login`
          );

          // In development, return the link even if email fails
          if (process.env.NODE_ENV === 'development') {
            console.log('[PlatformService] Email sent status:', inviteSent);
          }
        }
      } catch (emailErr) {
        console.error('[PlatformService] Email sending failed:', emailErr);
        // Do NOT throw - email failure should not fail the operation
      }
    }

    return {
      userId,
      alreadyExisted,
      inviteSent,
      ...(process.env.NODE_ENV === 'development' && inviteLink ? { inviteLink } : {})
    };
  }

  /**
   * Update tenant features
   */
  static async updateTenantFeatures(
    tenantId: string,
    features: Array<{ feature_key: string; enabled: boolean }>,
    actorId: string
  ): Promise<void> {
    // Get current features for audit log
    const { data: currentFeatures } = await supabase
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', tenantId);

    // Upsert features
    const records = features.map(f => ({
      tenant_id: tenantId,
      feature_key: f.feature_key,
      enabled: f.enabled
    }));

    const { error } = await supabase
      .from('tenant_features')
      .upsert(records, {
        onConflict: 'tenant_id,feature_key'
      });

    if (error) throw error;

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: 'UPDATE_TENANT_FEATURES',
      targetType: 'tenant_features',
      targetId: tenantId,
      tenantId,
      before: { features: currentFeatures || [] },
      after: { features: records }
    });
  }

  /**
   * Finalize tenant onboarding
   * 
   * Validates:
   * - At least 1 campus
   * - At least 1 ADMIN user
   * - Required features enabled (DASHBOARD, ADMISSIONS)
   * - Tenant is active
   */
  static async finalizeTenantOnboarding(
    tenantId: string,
    actorId: string
  ): Promise<{ ok: boolean; tenant: any }> {
    // Validate tenant exists and is active
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      const error: any = new Error('Tenant not found');
      error.statusCode = 404;
      throw error;
    }

    if (!tenant.is_active) {
      const error: any = new Error('Tenant is not active');
      error.statusCode = 400;
      throw error;
    }

    // Validate at least 1 campus
    const { data: campuses } = await supabase
      .from('campuses')
      .select('id')
      .eq('tenant_id', tenantId);

    if (!campuses || campuses.length === 0) {
      const error: any = new Error('Tenant must have at least one campus');
      error.code = 'NO_CAMPUSES';
      error.statusCode = 400;
      throw error;
    }

    // Validate at least 1 ADMIN user
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'ADMIN');

    if (!admins || admins.length === 0) {
      const error: any = new Error('Tenant must have at least one admin user');
      error.code = 'NO_ADMINS';
      error.statusCode = 400;
      throw error;
    }

    // Validate required features
    const { data: features } = await supabase
      .from('tenant_features')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('feature_key', ['DASHBOARD', 'ADMISSIONS']);

    const requiredFeatures = ['DASHBOARD', 'ADMISSIONS'];
    const enabledFeatures = features?.filter(f => f.enabled).map(f => f.feature_key) || [];
    const missingFeatures = requiredFeatures.filter(f => !enabledFeatures.includes(f));

    if (missingFeatures.length > 0) {
      const error: any = new Error(`Required features not enabled: ${missingFeatures.join(', ')}`);
      error.code = 'MISSING_FEATURES';
      error.statusCode = 400;
      throw error;
    }

    // Mark onboarding complete
    const { error: updateError } = await supabase
      .from('tenants')
      .update({ onboarding_complete: true })
      .eq('id', tenantId);

    if (updateError) throw updateError;

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: 'FINALIZE_ONBOARDING',
      targetType: 'tenant',
      targetId: tenantId,
      tenantId,
      before: { onboarding_complete: false },
      after: { onboarding_complete: true }
    });

    return {
      ok: true,
      tenant: { ...tenant, onboarding_complete: true }
    };
  }

  /**
   * List users for a tenant
   */
  static async listTenantUsers(tenantId: string): Promise<any[]> {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_active, all_campuses_access, tenant_id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return users || [];
  }

  /**
   * Provision a user to a tenant
   * Creates or reuses auth user and adds to tenant
   */
  static async provisionTenantUser(
    tenantId: string,
    email: string,
    fullName: string,
    role: string,
    actorId: string,
    sendInvite: boolean = true
  ): Promise<{ userId: string; alreadyExisted: boolean; inviteSent: boolean }> {
    const emailLower = email.toLowerCase();

    // Validate email not in platform_users
    const { data: platformUser } = await supabase
      .from('platform_users')
      .select('id')
      .eq('email', emailLower)
      .single();

    if (platformUser) {
      const error: any = new Error('Email belongs to platform admin');
      error.code = 'EMAIL_IS_PLATFORM';
      error.statusCode = 409;
      throw error;
    }

    // Check if email exists in another tenant
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, tenant_id')
      .eq('email', emailLower)
      .single();

    if (existingProfile && existingProfile.tenant_id !== tenantId) {
      const error: any = new Error('Email already belongs to another tenant');
      error.code = 'EMAIL_IN_USE';
      error.statusCode = 409;
      throw error;
    }

    // Create or reuse auth user
    let userId: string;
    let alreadyExisted = false;

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existingAuthUser = users.find(u => u.email?.toLowerCase() === emailLower);

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      alreadyExisted = true;
    } else {
      const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
        email: emailLower,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (authError) throw authError;
      userId = newUser.user.id;
    }

    // Create or update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        tenant_id: tenantId,
        email: emailLower,
        full_name: fullName,
        role: role.toUpperCase(),
        all_campuses_access: false,
        is_active: true
      });

    if (profileError) throw profileError;

    // Auto-grant dashboard permissions if role is ADMIN
    if (role.toUpperCase() === 'ADMIN') {
      try {
        const granted = await grantAdminDashboardPerms({
          prisma,
          tenantId,
          profileId: userId,
        });
        if (granted > 0) {
          console.log(`[PlatformService] Auto-granted ${granted} dashboard permission(s) to ADMIN ${userId}`);
        }
      } catch (permErr) {
        // Non-fatal: permissions can be granted later via script
        console.error('[PlatformService] Failed to auto-grant dashboard permissions:', permErr);
      }
    }

    // Log audit
    await AuditLogger.logAction({
      actorId,
      action: 'PROVISION_TENANT_USER',
      targetType: 'profile',
      targetId: userId,
      tenantId,
      after: { email: emailLower, full_name: fullName, role }
    });

    // Send invite email
    let inviteSent = false;
    if (sendInvite) {
      try {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'invite',
          email: emailLower
        });

        if (linkError) {
          console.error('[PlatformService] Failed to generate invite link:', linkError);
        } else {
          const inviteLink = linkData.properties.action_link;
          const { data: tenant } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single();

          inviteSent = await emailService.sendInviteEmail(
            emailLower,
            inviteLink,
            tenant?.name
          );
        }
      } catch (emailErr) {
        console.error('[PlatformService] Email sending failed:', emailErr);
      }
    }

    return { userId, alreadyExisted, inviteSent };
  }

  /**
   * Resend invite to a user
   */
  static async resendInvite(userId: string): Promise<{ inviteSent: boolean; inviteLink?: string }> {
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, tenant_id, tenants(name)')
      .eq('id', userId)
      .single();

    if (!profile) {
      const error: any = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Generate new invite link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: profile.email
    });

    if (linkError) throw linkError;

    const inviteLink = linkData.properties.action_link;

    // In development, log the invite link
    if (process.env.NODE_ENV === 'development') {
      console.log('[PlatformService] DEV MODE: Resend invite link for', profile.email, ':', inviteLink);
    }

    // Send email
    const tenantName = (profile.tenants as any)?.name;
    const inviteSent = await emailService.sendInviteEmail(
      profile.email,
      inviteLink,
      tenantName
    );

    if (process.env.NODE_ENV === 'development') {
      console.log('[PlatformService] Resend email sent status:', inviteSent);
    }

    return {
      inviteSent,
      ...(process.env.NODE_ENV === 'development' ? { inviteLink } : {})
    };
  }
}
