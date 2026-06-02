import { AuthUser, Tenant, Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import {
  createTenantAdminUser,
  generateTempPassword,
  sendInviteEmail,
  updateTenantAdminUserAttributes,
} from '../cognito-tenant-admin';
import { toTenantGql, toSimpleGql } from '../settings-utils';

export async function handleOnboarding(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  _tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'createFirstAdmin':
    case 'POST:/api/platform/tenants/:id/first-admin': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid      = (args.tenantId ?? args.id) as string;
      const email    = args.email as string;
      const fullName = (args.fullName ?? args.full_name) as string;
      if (!tid || !email || !fullName) throw new AppError('BAD_REQUEST', 'tenantId, email, and fullName are required');

      const existingAuth = await AuthUser.findOne({ email }).lean();
      const authUserId = existingAuth
        ? existingAuth._id
        : (await AuthUser.create({ email, isActive: true, isPlatformAdmin: false }))._id;

      const existing = await Profile.findOne({ tenantId: tid, authUserId }).lean();
      if (existing) throw new AppError('CONFLICT', 'Primary admin already exists for this tenant');

      const profile = await Profile.create({
        tenantId:       tid,
        authUserId,
        email,
        fullName,
        personaRole:    'TENANT_ADMIN',
        isActive:       true,
        isPrimaryOwner: true,
        isAllCampuses:  true,
        campusAccess:   [],
        roles:          [],
      });

      const {
        AdminCreateUserCommand,
        AdminSetUserPasswordCommand,
        AdminUpdateUserAttributesCommand,
        CognitoIdentityProviderClient,
      } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognito  = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const tempPwd  = generateTempPassword();
      try {
        await createTenantAdminUser(cognito, AdminCreateUserCommand, {
          userPoolId: process.env.COGNITO_USER_POOL_ID!,
          email,
          fullName,
          tenantId: tid,
          tempPassword: tempPwd,
          suppressMessage: true,
        });
      } catch (err: unknown) {
        const cognitoErr = err as { name?: string };
        if (cognitoErr.name !== 'UsernameExistsException') throw err;
        await updateTenantAdminUserAttributes(cognito, AdminUpdateUserAttributesCommand, {
          userPoolId: process.env.COGNITO_USER_POOL_ID!,
          email,
          fullName,
          tenantId: tid,
        });
        await cognito.send(new AdminSetUserPasswordCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username:   email,
          Password:   tempPwd,
          Permanent:  false,
        }));
      }
      const tenant = await Tenant.findOne({ tenantId: tid }).select('tenantId slug name').lean();
      await sendInviteEmail(email, fullName, tempPwd, {
        tenantId: tid,
        tenantSlug: String(tenant?.slug ?? '').trim() || undefined,
        tenantName: String(tenant?.name ?? '').trim() || undefined,
        role: 'TENANT_ADMIN',
      });

      return toSimpleGql(profile.toObject() as unknown as Record<string, unknown>);
    }

    case 'finalizeOnboarding':
    case 'finalizeTenant':
    case 'POST:/api/platform/tenants/:id/finalize': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.id ?? args.tenantId) as string;
      const doc = await Tenant.findOneAndUpdate(
        { tenantId: id },
        { $set: { onboardingComplete: true, isActive: true, finalizedAt: new Date(), finalizedBy: ctx.userId } },
        { new: true }
      ).lean();
      return toTenantGql(doc as Record<string, unknown> | null);
    }

    default:
      return undefined;
  }
}
