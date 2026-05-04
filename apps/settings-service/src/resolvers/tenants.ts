import { Tenant, TenantFeature, Profile, generateTenantId } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

/** Mask an email for display: john.doe@example.com → j***@e*****.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const [domainName, ...tldParts] = (domain ?? '').split('.');
  return `${local[0] ?? ''}***@${domainName?.[0] ?? ''}*****.${tldParts.join('.')}`;
}

/** Generate a 6-digit OTP */
function generateOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

/** Serialize a Tenant DB document to GraphQL shape (maps tenantId → id). */
function toGql(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc as Record<string, unknown>;
  return { ...rest, id: rest['tenantId'] };
}

export async function resolveTenants(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    // ── List / Get ────────────────────────────────────────────────────────────

    case 'listTenants':
    case 'GET:/api/platform/tenants': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const filter: Record<string, unknown> = {};
      if (args.isActive !== undefined) filter.isActive = args.isActive === 'true' || args.isActive === true;
      const docs = await Tenant.find(filter).sort({ name: 1 }).lean();
      return { items: docs.map(d => toGql(d as Record<string, unknown>)), nextToken: null };
    }

    case 'getTenant':
    case 'GET:/api/platform/tenants/:id': {
      const id = (args.tenantId ?? args.id) as string;
      if (!ctx.isPlatformAdmin && id !== tenantId) {
        throw new AppError('FORBIDDEN', 'Cannot view another tenant');
      }
      return toGql(await Tenant.findOne({ tenantId: id }).lean() as Record<string, unknown> | null);
    }

    // ── Subdomain validation ──────────────────────────────────────────────────

    case 'validateSubdomain':
    case 'GET:/api/platform/validate-subdomain': {
      const raw        = (args.subdomain as string ?? '').toLowerCase().trim();
      const normalized = raw.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const fullDomain = `${normalized}.vebgenix.com`;
      const existing   = await Tenant.findOne({ slug: normalized }).lean();
      const available  = !existing;
      let suggestion: string | undefined;
      if (!available) {
        // Append a short numeric suffix until we find a free slot
        for (let i = 2; i <= 9; i++) {
          const candidate = `${normalized}${i}`;
          const taken = await Tenant.findOne({ slug: candidate }).lean();
          if (!taken) { suggestion = `${candidate}.vebgenix.com`; break; }
        }
      }
      return { available, normalized, fullDomain, suggestion };
    }

    // ── Create tenant (manual) ────────────────────────────────────────────────

    case 'createTenant':
    case 'POST:/api/platform/tenants': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const input      = (args.input as Record<string, unknown>) ?? args;
      const newTenantId = generateTenantId(input.type as string | undefined);
      const tenant     = await Tenant.create({ ...input, tenantId: newTenantId, isActive: true });
      await TenantFeature.create({ tenantId: newTenantId });
      return toGql(tenant.toObject() as Record<string, unknown>);
    }

    // ── Provision tenant (full automated workflow) ────────────────────────────

    case 'provisionTenant':
    case 'POST:/api/platform/tenants/provision': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const input = (args.input as Record<string, unknown>) ?? args;
      const {
        organizationName,
        subdomain,
        features   = [],
        adminName,
        adminEmail,
      } = input as {
        organizationName: string;
        subdomain:        string;
        features:         string[];
        adminName:        string;
        adminEmail:       string;
      };

      // 1. Ensure subdomain is free
      const slugTaken = await Tenant.findOne({ slug: subdomain }).lean();
      if (slugTaken) throw new AppError('CONFLICT', `Subdomain "${subdomain}" is already taken`);

      // 2. Create tenant with prefixed ID
      const newTenantId = generateTenantId('org');
      const tenant = await Tenant.create({
        tenantId:  newTenantId,
        name:      organizationName,
        slug:      subdomain,
        isActive:  true,
        onboardingComplete: false,
      });

      // 3. Set up feature flags from the requested features list
      const featureFlags = (features as string[]).reduce<Record<string, boolean>>(
        (acc, key) => { acc[key] = true; return acc; },
        {},
      );
      await TenantFeature.create({ tenantId: newTenantId, features: featureFlags });

      // 4. Create Cognito admin user — Cognito sends the invite email automatically
      let inviteSent = false;
      try {
        const {
          AdminCreateUserCommand,
          AdminAddUserToGroupCommand,
          CognitoIdentityProviderClient,
        } = await import('@aws-sdk/client-cognito-identity-provider');
        const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
        await cognito.send(new AdminCreateUserCommand({
          UserPoolId:             process.env.COGNITO_USER_POOL_ID,
          Username:               adminEmail,
          DesiredDeliveryMediums: ['EMAIL'],
          UserAttributes: [
            { Name: 'email',            Value: adminEmail },
            { Name: 'name',             Value: adminName  },
            { Name: 'custom:tenantId',  Value: newTenantId },
            { Name: 'custom:role',      Value: 'ADMIN'    },
            { Name: 'email_verified',   Value: 'true'     },
          ],
        }));
        await cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username:   adminEmail,
          GroupName:  'ADMIN',
        }));
        inviteSent = true;
      } catch (err) {
        console.error('[settings/provisionTenant] Cognito invite failed:', err);
        // Don't rollback the tenant — admin can resend via resendTenantInvite
      }

      // 5. Create the admin's Profile document
      await Profile.create({
        tenantId:    newTenantId,
        email:       adminEmail,
        fullName:    adminName,
        personaRole: 'ADMIN',
        isActive:    true,
        isPrimaryOwner: true,
        roleAssignments: [{ role: 'ADMIN', assignedAt: new Date() }],
      });

      return { tenant: tenant.toObject(), adminEmail, inviteSent };
    }

    // ── Update tenant ─────────────────────────────────────────────────────────

    case 'updateTenant':
    case 'PATCH:/api/platform/tenants/:id':
    case 'PATCH:/api/admin/settings/tenant': {
      const id               = (args.tenantId ?? args.id) as string | undefined;
      const resolvedTenantId = id ?? tenantId;
      if (!ctx.isPlatformAdmin) authorize(ctx, 'tenant.settings.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      const { isActive: _ia, slug: _sl, tenantId: _tid, ...safeInput } = input as Record<string, unknown>;
      return toGql(await Tenant.findOneAndUpdate(
        { tenantId: resolvedTenantId },
        { $set: safeInput },
        { new: true },
      ).lean() as Record<string, unknown> | null);
    }

    case 'deactivateTenant':
    case 'DELETE:/api/platform/tenants/:id': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.tenantId ?? args.id) as string;
      return toGql(await Tenant.findOneAndUpdate(
        { tenantId: id },
        { $set: { isActive: false } },
        { new: true },
      ).lean() as Record<string, unknown> | null);
    }

    // ── Tenant deletion OTP flow ──────────────────────────────────────────────

    case 'requestTenantDeletion':
    case 'POST:/api/platform/tenants/:id/request-deletion': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id     = (args.tenantId ?? args.id) as string;
      const tenant = await Tenant.findOne({ tenantId: id }).lean();
      if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found');

      // Find primary admin to send OTP to
      const adminProfile = await Profile.findOne({
        tenantId:       id,
        isPrimaryOwner: true,
        isActive:       true,
      }).lean();
      const adminEmail = (adminProfile as unknown as Record<string, unknown> | null)?.email as string
        ?? ctx.email;
      if (!adminEmail) throw new AppError('BAD_REQUEST', 'No admin email found for this tenant');

      const otp       = generateOtp();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store OTP on tenant document
      await Tenant.findOneAndUpdate(
        { tenantId: id },
        { $set: { deletionOtp: otp, deletionOtpExpiresAt: expiresAt } },
      );

      // Send OTP via Cognito (re-use admin user mechanism) or log for now
      // In production, wire this to your email/SES worker via EventBridge
      console.info(`[settings/requestTenantDeletion] OTP for tenant ${id}: ${otp} (expires ${expiresAt.toISOString()})`);

      const EXPIRES_SECONDS = 15 * 60;
      return {
        sent:        true,
        expiresIn:   EXPIRES_SECONDS,
        maskedEmail: maskEmail(adminEmail),
      };
    }

    case 'confirmTenantDeletion':
    case 'POST:/api/platform/tenants/:id/confirm-deletion': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id  = (args.tenantId ?? args.id) as string;
      const otp = args.otp as string;

      const tenant = await Tenant.findOne({ tenantId: id }) as unknown as Record<string, unknown> | null;
      if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found');

      const storedOtp   = tenant.deletionOtp         as string | undefined;
      const expiresAt   = tenant.deletionOtpExpiresAt as Date   | undefined;

      if (!storedOtp || storedOtp !== otp) {
        throw new AppError('BAD_REQUEST', 'Invalid OTP');
      }
      if (!expiresAt || new Date() > new Date(expiresAt)) {
        throw new AppError('BAD_REQUEST', 'OTP has expired — request a new one');
      }

      // Clear OTP and mark tenant as deleted (soft delete)
      await Tenant.findOneAndUpdate(
        { tenantId: id },
        {
          $set:   { isActive: false, deletedAt: new Date(), deletedBy: ctx.userId },
          $unset: { deletionOtp: '', deletionOtpExpiresAt: '' },
        },
      );

      return true;
    }

    default:
      return undefined;
  }
}
