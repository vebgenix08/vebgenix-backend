import { AuthUser, Tenant, Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import {
  createTenantAdminUser,
  generateTempPassword,
  sendInviteEmail,
  setTenantAdminTemporaryPassword,
  updateTenantAdminUserAttributes,
} from './cognitoTenantAdmin';

function tenantToGql(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return {
    ...rest,
    id: rest.tenantId ?? String(_id),
    features: [],
    fullDomain: rest.slug ? `${String(rest.slug)}.vebgenix.com` : null,
    isActive: rest.isActive ?? true,
    onboardingComplete: rest.onboardingComplete ?? false,
    createdAt: rest.createdAt ? String(rest.createdAt) : new Date().toISOString(),
  };
}

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
      await sendInviteEmail(email, fullName, tempPwd);

      return {
        id:          String(profile._id),
        email:       profile.email,
        fullName:    profile.fullName,
        personaRole: profile.personaRole,
        isActive:    profile.isActive,
      };
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
      return tenantToGql(doc as Record<string, unknown> | null);
    }

    case 'listTenantUsers':
    case 'GET:/api/platform/tenants/:id/users': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid    = (args.id ?? args.tenantId) as string;
      const limit  = Math.min((args.limit as number) ?? 50, 200);
      const offset = (args.offset as number) ?? 0;
      const docs   = await Profile.find({ tenantId: tid, isActive: true })
        .sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return docs.map((d: Record<string, unknown>) => ({
        id:          String(d._id),
        email:       d.email,
        fullName:    d.fullName,
        personaRole: d.personaRole,
        isActive:    d.isActive,
      }));
    }

    case 'provisionTenantUser':
    case 'POST:/api/platform/tenants/:id/users': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid   = (args.id ?? args.tenantId) as string;
      const { AdminCreateUserCommand, CognitoIdentityProviderClient } =
        await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const email   = args.email as string;
      const role    = (args.role as string) ?? 'STAFF';
      const name    = ((args.fullName ?? args.name) as string) ?? email;
      const createResp = await createTenantAdminUser(cognito, AdminCreateUserCommand, {
        userPoolId: process.env.COGNITO_USER_POOL_ID!,
        email,
        fullName: name,
        tenantId: tid,
        role,
      });
      const cognitoSub = createResp.User?.Attributes?.find((a: { Name?: string; Value?: string }) => a.Name === 'sub')?.Value;
      if (!cognitoSub) throw new AppError('BAD_REQUEST', 'Cognito did not return a user id');
      const authUser = await AuthUser.create({
        cognitoSub,
        email,
        isActive:        true,
        isPlatformAdmin: false,
      });
      const profile = await Profile.create({
        tenantId:    tid,
        authUserId:  authUser._id,
        email,
        fullName:    name,
        personaRole: role,
        isActive:    true,
      });
      return { success: true, profileId: profile._id };
    }

    case 'deleteTenantUser':
    case 'DELETE:/api/platform/tenants/:tenantId/users/:userId': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid    = args.tenantId as string;
      const userId = args.userId   as string;
      const profile = await Profile.findOneAndUpdate(
        { tenantId: tid, _id: new Types.ObjectId(userId) },
        { $set: { isActive: false } },
        { new: true }
      ).lean();
      if (!profile) throw new AppError('NOT_FOUND', 'User not found in this tenant');
      return { success: true, message: 'User deactivated from tenant' };
    }

    case 'resendTenantInvite':
    case 'POST:/api/platform/tenants/:id/resend-invite': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tenantId = (args.tenantId ?? args.id) as string;
      const adminProfile =
        await Profile.findOne({
          tenantId,
          isPrimaryOwner: true,
          isActive: true,
        }).lean() ??
        await Profile.findOne({
          tenantId,
          isActive: true,
          personaRole: 'TENANT_ADMIN',
        }).sort({ createdAt: 1 }).lean();
      const email = (args.email as string | undefined) ?? adminProfile?.email;
      if (!email) throw new AppError('BAD_REQUEST', 'No primary admin email found for this tenant');
      const authUser = adminProfile?.authUserId
        ? await AuthUser.findById(adminProfile.authUserId).lean()
        : await AuthUser.findOne({ email }).lean();
      const {
        AdminGetUserCommand,
        AdminCreateUserCommand,
        AdminSetUserPasswordCommand,
        AdminUpdateUserAttributesCommand,
        CognitoIdentityProviderClient,
      } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognito  = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const fullName = (adminProfile?.fullName as string | undefined) ?? email;
      const tempPwd  = generateTempPassword();
      const preferredUsername = String(authUser?.cognitoSub ?? email).trim() || email;
      const passwordReset = await setTenantAdminTemporaryPassword(
        cognito,
        AdminSetUserPasswordCommand,
        AdminGetUserCommand,
        process.env.COGNITO_USER_POOL_ID!,
        preferredUsername,
        tempPwd,
      );
      if (!passwordReset.existed) {
        await createTenantAdminUser(cognito, AdminCreateUserCommand, {
          userPoolId: process.env.COGNITO_USER_POOL_ID!,
          email,
          fullName,
          tenantId,
          tempPassword: tempPwd,
          suppressMessage: true,
        });
      }
      await updateTenantAdminUserAttributes(cognito, AdminUpdateUserAttributesCommand, {
        userPoolId: process.env.COGNITO_USER_POOL_ID!,
        username: passwordReset.existed ? passwordReset.username : email,
        email,
        fullName,
        tenantId,
      }).catch(() => { /* ignore if user state prevents it */ });
      await sendInviteEmail(email, fullName, tempPwd);
      return true;
    }

    default:
      return undefined;
  }
}
