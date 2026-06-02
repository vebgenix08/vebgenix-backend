import { AuthUser, Tenant, Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import {
  createTenantAdminUser,
  generateTempPassword,
  resolveTenantAdminUsername,
  sendInviteEmail,
  setTenantAdminTemporaryPassword,
  updateTenantAdminUserAttributes,
} from '../cognito-tenant-admin';
import { toSimpleGql } from '../settings-utils';

export async function handleTenantUsers(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  _tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listTenantUsers':
    case 'GET:/api/platform/tenants/:id/users': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid    = (args.id ?? args.tenantId) as string;
      const limit  = Math.min((args.limit as number) ?? 50, 200);
      const offset = (args.offset as number) ?? 0;
      const docs   = await Profile.find({ tenantId: tid, isActive: true })
        .sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return docs.map((d: Record<string, unknown>) => toSimpleGql({
        _id: d._id,
        email: d.email,
        fullName: d.fullName,
        personaRole: d.personaRole,
        isActive: d.isActive,
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
        isActive: true,
        isPlatformAdmin: false,
      });
      const profile = await Profile.create({
        tenantId: tid,
        authUserId: authUser._id,
        email,
        fullName: name,
        personaRole: role,
        isActive: true,
      });
      return { success: true, profileId: profile._id };
    }

    case 'deleteTenantUser':
    case 'DELETE:/api/platform/tenants/:tenantId/users/:userId': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const tid = args.tenantId as string;
      const userId = args.userId as string;
      const profile = await Profile.findOneAndUpdate(
        { tenantId: tid, _id: new Types.ObjectId(userId) },
        { $set: { isActive: false } },
        { new: true },
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
        ListUsersCommand,
        AdminCreateUserCommand,
        AdminSetUserPasswordCommand,
        AdminUpdateUserAttributesCommand,
        CognitoIdentityProviderClient,
      } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const fullName = (adminProfile?.fullName as string | undefined) ?? email;
      const tempPwd = generateTempPassword();
      const preferredUsername = String(authUser?.cognitoSub ?? email).trim() || email;
      const resolvedUser = await resolveTenantAdminUsername(
        cognito,
        AdminGetUserCommand,
        ListUsersCommand,
        process.env.COGNITO_USER_POOL_ID!,
        {
          preferredUsername,
          email,
        },
      );
      console.info('[settings/resendTenantInvite] resolved Cognito user', {
        tenantId,
        email,
        preferredUsername,
        resolvedUsername: resolvedUser?.username ?? null,
        source: resolvedUser?.source ?? null,
      });
      const passwordReset = await setTenantAdminTemporaryPassword(
        cognito,
        AdminSetUserPasswordCommand,
        AdminGetUserCommand,
        process.env.COGNITO_USER_POOL_ID!,
        resolvedUser?.username ?? preferredUsername,
        tempPwd,
      );
      if (!passwordReset.existed) {
        console.info('[settings/resendTenantInvite] creating missing Cognito user', {
          tenantId,
          email,
        });
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
      }).catch((error: unknown) => {
        console.warn('[settings/resendTenantInvite] failed to update Cognito attributes', {
          tenantId,
          email,
          username: passwordReset.existed ? passwordReset.username : email,
          error,
        });
      });
      const tenant = await Tenant.findOne({ tenantId }).select('tenantId slug name').lean();
      await sendInviteEmail(email, fullName, tempPwd, {
        tenantId,
        tenantSlug: String(tenant?.slug ?? '').trim() || undefined,
        tenantName: String(tenant?.name ?? '').trim() || undefined,
        role: 'TENANT_ADMIN',
      });
      return true;
    }

    default:
      return undefined;
  }
}
