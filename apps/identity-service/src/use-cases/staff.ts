import { IdentityRepo, Employee } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { toGql } from '../identity-utils';
import { cognitoUserExists, ensureInvitedStaffCognitoUser } from './invites';

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

  await ensureInvitedStaffCognitoUser({
    userPoolId,
    email: input.email,
    fullName: input.fullName,
    tenantId,
  });

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
      roles:          (input.roleIds ?? []).filter(id => /^[a-f0-9]{24}$/i.test(id)).map((id) => ({ roleId: new Types.ObjectId(id), roleName: '', permissions: [] })),
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

  if (existing && !(await cognitoUserExists(userPoolId, input.email))) {
    throw new AppError('INTERNAL', 'Staff invite could not be completed in Cognito');
  }

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
