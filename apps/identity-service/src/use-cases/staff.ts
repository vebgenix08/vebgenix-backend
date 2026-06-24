import { IdentityRepo, Employee } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { buildRoleAssignments, toGql } from '../identity-utils';
import { UsernameExistsException } from '@aws-sdk/client-cognito-identity-provider';

async function sendStaffInviteEmail(
  toEmail: string,
  fullName: string,
  tempPassword: string,
  context: { tenantId: string; role: string },
) {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const ses = new SESClient({ region: process.env.COGNITO_REGION ?? 'ap-south-1' });
  const appBaseUrl = process.env.APP_BASE_URL ?? 'https://app.vebgenix.com';
  const params = new URLSearchParams({
    email: toEmail,
    token: tempPassword,
    tenantId: context.tenantId,
    role: context.role,
  });
  const link = `${appBaseUrl.replace(/\/$/, '')}/invite/accept?${params.toString()}`;
  const fromEmail = process.env.INVITE_FROM_EMAIL ?? 'contact@vebgenix.com';
  const firstName = fullName.split(' ')[0] || fullName;

  await ses.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'You\'ve been invited to Vebgenix — Activate your account' },
      Body: {
        Html: {
          Data: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:40px 0">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
<tr><td style="background:#1a56db;padding:32px 40px;text-align:center"><h1 style="color:#fff;margin:0;font-size:24px;font-weight:700">Vebgenix</h1></td></tr>
<tr><td style="padding:40px"><h2 style="color:#111827;margin:0 0 12px">Hello ${firstName},</h2><p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">You've been invited to join <strong>Vebgenix</strong> as a staff member.<br>Click the button below to activate your account and set your password.</p><div style="text-align:center;margin:32px 0"><a href="${link}" style="background:#1a56db;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block">Activate My Account</a></div><p style="color:#6b7280;font-size:13px;line-height:1.5;margin:24px 0 0">This link is valid for 7 days.</p></td></tr>
</table></td></tr></table></body></html>`,
        },
        Text: { Data: `Hello ${firstName},\n\nYou've been invited to Vebgenix as a staff member.\n\nActivate your account here:\n${link}\n\nThis link is valid for 7 days.\n\nVebgenix Team` },
      },
    },
  }));
}

async function inviteStaff(ctx: AuthContext, input: {
  email: string;
  fullName: string;
  phone?: string;
  campusId?: string;
  campusIds?: string[];
  allCampuses?: boolean;
  roleIds?: string[];
  staffType?: string;
  staffCategory?: 'TEACHING' | 'NON_TEACHING';
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'VISITING';
  designation?: string;
  department?: string;
  employeeCode?: string;
  tenantId?: string;
}) {
  authorize(ctx, 'staff.invite');
  const tenantId = (ctx.isPlatformAdmin && input.tenantId)
    ? input.tenantId
    : getTenantId(ctx);
  const campusId = input.campusId ?? input.campusIds?.[0];
  if (!campusId && !input.allCampuses) throw new AppError('BAD_REQUEST', 'campusId or campusIds[0] is required');
  const staffType = input.staffType ?? 'TEACHER';
  const staffCategory = input.staffCategory ?? (
    staffType === 'TEACHER' || staffType === 'LECTURER' || staffType === 'LAB_FACULTY'
      ? 'TEACHING'
      : 'NON_TEACHING'
  );

  let authUser = await IdentityRepo.findAuthUserByEmail(input.email);
  if (!authUser) {
    authUser = await IdentityRepo.createAuthUser({ email: input.email });
  }

  const existing = await IdentityRepo.findProfileByAuthUserId(tenantId, authUser._id.toString());
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) throw new AppError('INTERNAL', 'COGNITO_USER_POOL_ID not configured');

  const tempPassword = process.env.DEFAULT_INVITE_PASSWORD ?? `Tmp${new Types.ObjectId().toString().slice(-8)}!aA1`;
  const { AdminCreateUserCommand, CognitoIdentityProviderClient } =
    await import('@aws-sdk/client-cognito-identity-provider');
  const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: input.email,
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS',
      DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: [
        { Name: 'email', Value: input.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: input.fullName },
        { Name: 'custom:tenantId', Value: tenantId },
        { Name: 'custom:role', Value: input.staffType ?? 'STAFF' },
      ],
    }));
  } catch (error) {
    if (!(error instanceof UsernameExistsException)) throw error;
  }

  let profile = existing;
  if (!profile) {
      profile = await IdentityRepo.createProfile({
        tenantId,
        authUserId:     authUser._id as Types.ObjectId,
        email:          input.email,
        fullName:       input.fullName,
      phone:          input.phone,
      personaRole:    'STAFF',
      isActive:       true,
      isAllCampuses:  input.allCampuses === true,
        isPrimaryOwner: false,
        campusAccess:   input.allCampuses === true
        ? []
        : (input.campusIds?.length ? input.campusIds : [campusId]).map(id => ({ campusId: new Types.ObjectId(id!), campusName: '' })),
      roles:          buildRoleAssignments(input.roleIds),
      });
  }

  const employeeCode = input.employeeCode ?? `EMP${new Types.ObjectId().toString().slice(-8).toUpperCase()}`;
  let employee: { _id: Types.ObjectId } | null =
    profile.employeeId ? { _id: profile.employeeId as Types.ObjectId } : null;

  if (campusId && !employee) {
    employee = await Employee.create({
      tenantId,
      campusId:       new Types.ObjectId(campusId),
      profileId:      profile._id,
      authUserId:     authUser._id,
      employeeCode,
      fullName:       input.fullName,
      email:          input.email,
      phone:          input.phone,
      designation:    input.designation,
      department:     input.department,
      staffType,
      staffCategory,
      employmentType: input.employmentType ?? 'FULL_TIME',
      joiningDate:    new Date(),
      isActive:       true,
    });
    profile = await IdentityRepo.updateProfile(tenantId, profile._id.toString(), { employeeId: employee._id } as never) ?? profile;
  }

  await sendStaffInviteEmail(input.email, input.fullName, tempPassword, {
    tenantId,
    role: input.staffType ?? 'STAFF',
  });

  await AuditLogger.logTenantAction({
    ctx,
    action:     'STAFF_INVITED',
    entityType: 'Profile',
    entityId:   profile._id.toString(),
    entityName: input.fullName,
    after:      { email: input.email, staffType, staffCategory, employeeCode },
  });

  return {
    success:      true,
    membershipId: profile._id.toString(),
    id:           profile._id.toString(),
    employeeId:   employee ? employee._id.toString() : null,
    email:        profile.email,
    fullName:     profile.fullName,
  };
}

async function resendInvite(ctx: AuthContext, args: Record<string, unknown>, resolveTenantId: ResolveTenantId) {
  authorize(ctx, 'identity.users.update');
  const tenantId = resolveTenantId();
  const profileId = (args.staffId ?? args.id) as string;
  const profile  = await IdentityRepo.findProfileById(tenantId, profileId);
  if (!profile) throw new AppError('NOT_FOUND', 'Staff member not found');
  const { AdminCreateUserCommand: AdminCreateUserCmd, CognitoIdentityProviderClient: CognitoClient } =
    await import('@aws-sdk/client-cognito-identity-provider');
  const cognitoResend = new CognitoClient({ region: process.env.COGNITO_REGION });
  await cognitoResend.send(new AdminCreateUserCmd({
    UserPoolId:    process.env.COGNITO_USER_POOL_ID,
    Username:      profile.email,
    MessageAction: 'RESEND',
  }));
  return true;
}

export async function handleStaff(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  switch (operation) {
    case 'listStaff':
    case 'GET:/api/admin/staff': {
      const tenantId = resolveTenantId();
      const filter: Record<string, unknown> = { personaRole: { $in: ['STAFF', 'TEACHER'] } };
      if (args.campusId) filter['campusAccess.campusId'] = args.campusId;
      const profiles = await IdentityRepo.listProfiles(tenantId, filter);
      return (profiles as unknown[]).map(p => toGql(p));
    }
    case 'getStaffMember':
    case 'GET:/api/admin/staff/:id': {
      const tenantId = resolveTenantId();
      return toGql(await IdentityRepo.findProfileById(tenantId, args.id as string));
    }
    case 'inviteStaff':
    case 'POST:/api/admin/staff': {
      const input = { ...((args.input ?? args) as Parameters<typeof inviteStaff>[1]) };
      if (ctx.isPlatformAdmin && !ctx.membership) {
        input.tenantId = resolveTenantId();
      }
      return inviteStaff(ctx, input);
    }
    case 'resendInvite':
    case 'POST:/api/admin/staff/:id/resend-invite':
      return resendInvite(ctx, args, resolveTenantId);
    default:
      return undefined;
  }
}
