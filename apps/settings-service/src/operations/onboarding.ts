import { AuthUser, Tenant, Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import { createTenantAdminUser, updateTenantAdminUserAttributes } from './cognitoTenantAdmin';

function generateTempPassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghijkmnpqrstuvwxyz';
  const digits  = '23456789';
  const all     = upper + lower + digits;
  let pwd = upper[Math.floor(Math.random() * upper.length)]
          + lower[Math.floor(Math.random() * lower.length)]
          + digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 9; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

async function sendInviteEmail(toEmail: string, fullName: string, tempPassword: string): Promise<void> {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const ses        = new SESClient({ region: process.env.COGNITO_REGION ?? 'ap-south-1' });
  const appBaseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:5001').replace(/\/$/, '');
  const link       = `${appBaseUrl}/invite/accept?email=${encodeURIComponent(toEmail)}&token=${encodeURIComponent(tempPassword)}`;
  const fromEmail  = process.env.INVITE_FROM_EMAIL ?? 'contact@vebgenix.com';
  const firstName  = fullName.split(' ')[0] || fullName;

  await ses.send(new SendEmailCommand({
    Source:      fromEmail,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'You\'ve been invited to Vebgenix — Activate your account' },
      Body: {
        Html: {
          Data: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:40px 0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#1a56db;padding:32px 40px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700">Vebgenix</h1>
    </td></tr>
    <tr><td style="padding:40px">
      <h2 style="color:#111827;margin:0 0 12px">Hello ${firstName},</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">
        You've been invited to join <strong>Vebgenix</strong> as a tenant administrator.<br>
        Click the button below to activate your account and set your password.
      </p>
      <div style="text-align:center;margin:32px 0">
        <a href="${link}" style="background:#1a56db;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block">
          Activate My Account
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:24px 0 0">
        This link is valid for 7 days. If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </td></tr>
    <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0">© 2025 Vebgenix. All rights reserved.</p>
    </td></tr>
  </table>
  </td></tr></table>
</body>
</html>`,
        },
        Text: {
          Data: `Hello ${firstName},\n\nYou've been invited to Vebgenix as a tenant administrator.\n\nActivate your account here:\n${link}\n\nThis link is valid for 7 days.\n\nVebgenix Team`,
        },
      },
    },
  }));
}

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
      const adminProfile = await Profile.findOne({
        tenantId,
        isPrimaryOwner: true,
        isActive: true,
      }).lean();
      const email = (args.email as string | undefined) ?? adminProfile?.email;
      if (!email) throw new AppError('BAD_REQUEST', 'No primary admin email found for this tenant');
      const {
        AdminCreateUserCommand,
        AdminSetUserPasswordCommand,
        AdminUpdateUserAttributesCommand,
        CognitoIdentityProviderClient,
      } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognito  = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      const fullName = (adminProfile?.fullName as string | undefined) ?? email;
      const tempPwd  = generateTempPassword();
      try {
        await cognito.send(new AdminSetUserPasswordCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username:   email,
          Password:   tempPwd,
          Permanent:  false,
        }));
      } catch (err: unknown) {
        const e = err as { name?: string };
        if (e.name === 'UserNotFoundException') {
          await createTenantAdminUser(cognito, AdminCreateUserCommand, {
            userPoolId: process.env.COGNITO_USER_POOL_ID!,
            email,
            fullName,
            tenantId,
            tempPassword: tempPwd,
            suppressMessage: true,
          });
        } else {
          throw err;
        }
      }
      await updateTenantAdminUserAttributes(cognito, AdminUpdateUserAttributesCommand, {
        userPoolId: process.env.COGNITO_USER_POOL_ID!,
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
