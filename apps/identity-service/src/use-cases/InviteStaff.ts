import { AuthContext } from '@vebgenix/auth';
import { Employee, IdentityRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Types } from 'mongoose';

const cognitoClient = new CognitoIdentityProviderClient({});

export interface InviteStaffInput {
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
}

export class InviteStaff {
  static async execute(ctx: AuthContext, input: InviteStaffInput) {
    authorize(ctx, 'staff.invite');
    // Platform admins acting on behalf of a tenant pass tenantId in the input
    const tenantId = (ctx.isPlatformAdmin && input.tenantId)
      ? input.tenantId
      : getTenantId(ctx);
    const campusId = input.campusId ?? input.campusIds?.[0];
    if (!campusId && !input.allCampuses) throw new AppError('BAD_REQUEST', 'campusId or campusIds[0] is required');
    const staffType = input.staffType ?? 'TEACHER';
    const staffCategory = input.staffCategory ?? (staffType === 'TEACHER' || staffType === 'LECTURER' || staffType === 'LAB_FACULTY'
      ? 'TEACHING'
      : 'NON_TEACHING');

    // ── 1. Pre-register the user shell in MongoDB ─────────────────────────
    // The real AuthUser (with cognitoSub) is created by the PostConfirmation
    // Lambda trigger when the staff member accepts the invite and sets their password.
    let authUser = await IdentityRepo.findAuthUserByEmail(input.email);
    if (!authUser) {
      // Shell record — cognitoSub will be filled in by the PostConfirmation trigger
      authUser = await IdentityRepo.createAuthUser({ email: input.email });
    }

    const existing = await IdentityRepo.findProfileByAuthUserId(tenantId, authUser._id.toString());
    if (existing) throw new AppError('CONFLICT', 'Staff member already exists in this tenant');

    // ── 2. Create the tenant Profile ──────────────────────────────────────
    const profile = await IdentityRepo.createProfile({
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
        : (input.campusIds?.length ? input.campusIds : [campusId]).map(id => ({ campusId: new Types.ObjectId(id), campusName: '' })),
      roles:          input.roleIds?.map(id => ({ roleId: new Types.ObjectId(id), roleName: '', permissions: [] })) ?? [],
    });

    const employeeCode = input.employeeCode ?? `EMP${new Types.ObjectId().toString().slice(-8).toUpperCase()}`;
    let employee: { _id: Types.ObjectId } | null = null;
    if (campusId) {
      employee = await Employee.create({
        tenantId,
        campusId:      new Types.ObjectId(campusId),
        profileId:     profile._id,
        authUserId:    authUser._id,
        employeeCode,
        fullName:      input.fullName,
        email:         input.email,
        phone:         input.phone,
        designation:   input.designation,
        department:    input.department,
        staffType,
        staffCategory,
        employmentType: input.employmentType ?? 'FULL_TIME',
        joiningDate:    new Date(),
        isActive:       true,
      });
      await IdentityRepo.updateProfile(tenantId, profile._id.toString(), { employeeId: employee._id } as never);
    }

    // ── 3. Create the Cognito user and send the invite email ──────────────
    // Cognito sends a temporary-password email automatically (AdminCreateUser).
    // On first login the staff member is forced to change their password.
    // The PostConfirmation trigger then runs and sets cognitoSub on the AuthUser above.
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) throw new AppError('INTERNAL', 'COGNITO_USER_POOL_ID not configured');

    const params: AdminCreateUserCommandInput = {
      UserPoolId:              userPoolId,
      Username:                input.email,
      UserAttributes: [
        { Name: 'email',          Value: input.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name',           Value: input.fullName },
        // Attach tenantId as a custom attribute so it's available in token claims
        { Name: 'custom:tenantId', Value: tenantId },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
      ForceAliasCreation:     false,
    };

    try {
      await cognitoClient.send(new AdminCreateUserCommand(params));
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        // User already exists in Cognito — that is fine, just link their profile
        console.log(`[identity-service] Cognito user already exists for ${input.email}`);
      } else {
        throw err;
      }
    }

    // ── 4. Audit ──────────────────────────────────────────────────────────
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
}
