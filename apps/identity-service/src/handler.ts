/**
 * Identity Service Lambda
 *
 * Handles: user profiles, staff management, roles, campus access,
 *          employee records, impersonation (platform admin only).
 *
 * Does NOT handle: login / logout / token refresh — those are owned by Cognito.
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer) — event.identity.claims is pre-verified
 *   - EC2 REST proxy — Authorization: Bearer <Cognito Access Token>
 */
import { bootstrapDB, ensureDB, IdentityRepo, Profile, Employee, Tenant } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminGetUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';

type MembershipContext = AuthContext & {
  memberships?: Array<{
    tenantId: string;
    profileId: string;
    isAllCampuses: boolean;
    isPrimaryOwner: boolean;
    campusIds: string[];
    personaRole?: string;
    roles: Array<{
      roleId: Types.ObjectId;
      roleName: string;
      permissions: string[];
    }>;
  }>;
};

type MembershipSummary = NonNullable<MembershipContext['memberships']>[number];

const cognitoClient = new CognitoIdentityProviderClient({});

function cognitoErrorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
}

function cognitoErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
}

function shouldRetryWithoutCustomAttributes(error: unknown): boolean {
  const name = cognitoErrorName(error);
  const message = cognitoErrorMessage(error).toLowerCase();
  if (name !== 'InvalidParameterException') return false;
  return (
    message.includes('custom:tenantid') ||
    message.includes('custom:role') ||
    message.includes('custom attribute') ||
    message.includes('custom attributes')
  );
}

function buildInviteUserAttributes(input: {
  email: string;
  fullName: string;
  tenantId: string;
}, includeCustomAttributes: boolean) {
  const attributes = [
    { Name: 'email', Value: input.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: input.fullName },
  ];

  if (includeCustomAttributes) {
    attributes.push({ Name: 'custom:tenantId', Value: input.tenantId });
  }

  return attributes;
}

async function ensureInvitedStaffCognitoUser(input: {
  userPoolId: string;
  email: string;
  fullName: string;
  tenantId: string;
}) {
  const baseInput: AdminCreateUserCommandInput = {
    UserPoolId: input.userPoolId,
    Username: input.email,
    UserAttributes: buildInviteUserAttributes(input, true),
    DesiredDeliveryMediums: ['EMAIL'],
    ForceAliasCreation: false,
  };

  try {
    await cognitoClient.send(new AdminCreateUserCommand(baseInput));
    return;
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      return;
    }

    if (shouldRetryWithoutCustomAttributes(error)) {
      try {
        await cognitoClient.send(new AdminCreateUserCommand({
          ...baseInput,
          UserAttributes: buildInviteUserAttributes(input, false),
        }));
        return;
      } catch (retryError) {
        if (retryError instanceof UsernameExistsException) {
          return;
        }
        throw retryError;
      }
    }

    throw error;
  }
}

async function cognitoUserExists(userPoolId: string, email: string) {
  try {
    await cognitoClient.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: email,
    }));
    return true;
  } catch {
    return false;
  }
}

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string'
    ? JSON.parse(event.body || '{}')
    : (event.body ?? {}) as Record<string, unknown>;
  const params = (event.pathParameters ?? {}) as Record<string, string>;
  const qs     = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

function toGqlProfile(profile: unknown, fallback: { id?: string; email?: string } = {}): Record<string, unknown> {
  if (!profile) return { id: fallback.id ?? '', email: fallback.email ?? '' };
  const doc = (profile as { toObject?: () => Record<string, unknown> }).toObject?.()
    ?? (profile as Record<string, unknown>);
  const { _id, ...rest } = doc;
  const roleAssignments = Array.isArray(doc.roles)
    ? (doc.roles as Array<Record<string, unknown>>).map((role) => ({
        roleId:      role.roleId?.toString?.() ?? role.roleId ?? null,
        roleName:    String(role.roleName ?? role.role ?? ''),
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
      })).filter((role) => role.roleName)
    : [];
  return {
    ...rest,
    id:    String(doc.id ?? _id ?? fallback.id ?? ''),
    email: String(doc.email ?? fallback.email ?? ''),
    roles: roleAssignments.map((role) => role.roleName),
    roleAssignments,
  };
}

// ── Inlined use-case: createUser ─────────────────────────────────────────────
async function createUser(ctx: AuthContext, input: {
  email: string;
  fullName: string;
  phone?: string;
  personaRole: string;
  campusId: string;
  roleIds?: string[];
}) {
  authorize(ctx, 'users.create');
  const tenantId = getTenantId(ctx);

  const existingAuthUser = await IdentityRepo.findAuthUserByEmail(input.email);
  if (existingAuthUser) {
    const authRecord = existingAuthUser as unknown as Record<string, unknown>;
    if (authRecord.isPlatformAdmin === true) {
      throw new AppError('FORBIDDEN', 'Cannot create a tenant profile for a platform super-admin account');
    }
    const existingProfile = await IdentityRepo.findProfileByAuthUserId(tenantId, existingAuthUser._id.toString());
    if (existingProfile) {
      throw new AppError('CONFLICT', 'User already exists in this tenant');
    }
  }

  let authUser = existingAuthUser;
  if (!authUser) {
    authUser = await IdentityRepo.createAuthUser({ email: input.email });
  }

  const profile = await IdentityRepo.createProfile({
    tenantId,
    authUserId:     authUser._id as Types.ObjectId,
    email:          input.email,
    fullName:       input.fullName,
    phone:          input.phone,
    personaRole:    input.personaRole as 'TENANT_ADMIN' | 'STAFF' | 'STUDENT' | 'PARENT',
    isActive:       true,
    isAllCampuses:  false,
    isPrimaryOwner: false,
    campusAccess:   [{ campusId: new Types.ObjectId(input.campusId), campusName: '' }],
    roles:          (input.roleIds ?? []).filter(id => /^[a-f0-9]{24}$/i.test(id)).map((id) => ({ roleId: new Types.ObjectId(id), roleName: '', permissions: [] })),
  });

  await AuditLogger.logTenantAction({
    ctx, action: 'USER_CREATED',
    entityType: 'Profile', entityId: profile._id.toString(), entityName: input.fullName,
    after: { email: input.email, personaRole: input.personaRole },
  });

  return {
    id:          profile._id.toString(),
    email:       profile.email,
    fullName:    profile.fullName,
    personaRole: profile.personaRole,
  };
}

// ── Inlined use-case: updateUser ─────────────────────────────────────────────
async function updateUser(ctx: AuthContext, input: {
  profileId: string;
  fullName?: string;
  phone?: string;
  isActive?: boolean;
  isAllCampuses?: boolean;
}) {
  authorize(ctx, 'users.update');
  const tenantId = getTenantId(ctx);

  const profile = await IdentityRepo.findProfileById(tenantId, input.profileId);
  if (!profile) throw new AppError('NOT_FOUND', 'User not found');

  const before = { fullName: profile.fullName, phone: profile.phone, isActive: profile.isActive };
  const updated = await IdentityRepo.updateProfile(tenantId, input.profileId, {
    ...(input.fullName !== undefined && { fullName: input.fullName }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.isAllCampuses !== undefined && { isAllCampuses: input.isAllCampuses }),
  });

  await AuditLogger.logTenantAction({
    ctx, action: 'USER_UPDATED',
    entityType: 'Profile', entityId: input.profileId, entityName: profile.fullName,
    before, after: input as unknown as Record<string, unknown>,
  });

  return updated;
}

// ── Inlined use-case: deactivateUser ─────────────────────────────────────────
async function deactivateUser(ctx: AuthContext, profileId: string) {
  authorize(ctx, 'users.delete');
  const tenantId = getTenantId(ctx);

  const profile = await IdentityRepo.findProfileById(tenantId, profileId);
  if (!profile) throw new AppError('NOT_FOUND', 'User not found');
  if (profile.isPrimaryOwner) throw new AppError('FORBIDDEN', 'Cannot deactivate the primary owner');

  await IdentityRepo.deactivateProfile(tenantId, profileId);

  await AuditLogger.logTenantAction({
    ctx, action: 'USER_DEACTIVATED',
    entityType: 'Profile', entityId: profileId, entityName: profile.fullName,
  });

  return true;
}

// ── Inlined use-case: inviteStaff ─────────────────────────────────────────────
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
      roles:          (input.roleIds ?? []).filter(id => /^[a-f0-9]{24}$/i.test(id)).map(id => ({ roleId: new Types.ObjectId(id), roleName: '', permissions: [] })),
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

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();

    const ctx                  = await resolveContext(event);
    const { operation, args } = parseEvent(event);

    const headerTenantId = (event.request as Record<string, Record<string, string>> | undefined)
      ?.headers?.['x-tenant-id'] ?? '';
    const resolveTenantId = (): string =>
      (ctx.isPlatformAdmin && headerTenantId) ? headerTenantId : getTenantId(ctx);

    switch (operation) {

      // ── Who am I ──────────────────────────────────────────────────────────
      case 'me':
      case 'GET:/api/me': {
        const memberships = ((ctx as MembershipContext).memberships ?? (ctx.membership ? [ctx.membership] : []));
        const tenantIds = memberships.map((membership) => membership.tenantId);
        const tenantDocs = tenantIds.length
          ? await Tenant.find({ tenantId: { $in: tenantIds } }).select('tenantId name slug isActive').lean()
          : [];
        const tenantMap = new Map(
          tenantDocs.map((tenant) => [String((tenant as Record<string, unknown>).tenantId ?? ''), tenant as Record<string, unknown>]),
        );
        const membershipPayload = memberships.map((membership: MembershipSummary | NonNullable<AuthContext['membership']>) => {
          const tenant = tenantMap.get(membership.tenantId);
          return {
            tenant: {
              id: membership.tenantId,
              name: String(tenant?.name ?? membership.tenantId),
              slug: tenant?.slug ? String(tenant.slug) : null,
              isActive: typeof tenant?.isActive === 'boolean' ? tenant.isActive : true,
            },
            role: ('personaRole' in membership ? membership.personaRole : undefined) ?? membership.roles[0]?.roleName ?? 'STAFF',
            status: 'ACTIVE',
          };
        });
        const tenantId = ctx.membership?.tenantId;
        if (!tenantId) {
          return {
            id: ctx.userId,
            email: ctx.email,
            isPlatformAdmin: ctx.isPlatformAdmin,
            permissions: [],
            roles: [],
            roleAssignments: [],
            memberships: membershipPayload,
          };
        }
        const profile = await IdentityRepo.findProfileByAuthUserId(tenantId, ctx.userId);
        if (!profile) {
          return {
            id: ctx.userId,
            email: ctx.email,
            permissions: [],
            roles: [],
            roleAssignments: [],
            memberships: membershipPayload,
          };
        }
        const profileGql = toGqlProfile(profile, { id: ctx.userId, email: ctx.email }) as Record<string, unknown>;
        return {
          ...profileGql,
          isPlatformAdmin: ctx.isPlatformAdmin ?? false,
          permissions: Array.from(ctx.permissions),
          roles: (ctx.membership?.roles ?? []).map(r => r.roleName),
          roleAssignments: (ctx.membership?.roles ?? []).map(r => ({
            roleId:      r.roleId?.toString() ?? null,
            roleName:    r.roleName,
            permissions: r.permissions ?? [],
          })),
          memberships: membershipPayload,
        };
      }

      // ── Users ─────────────────────────────────────────────────────────────
      case 'listUsers':
      case 'GET:/api/admin/users': {
        const tenantId = resolveTenantId();
        const inputFilter = (args.filter as Record<string, unknown> | undefined) ?? {};
        const filter: Record<string, unknown> = { personaRole: { $ne: 'STUDENT' } };
        const isActive = inputFilter.isActive ?? args.isActive;
        const campusId = inputFilter.campusId ?? args.campusId;
        const search = String(inputFilter.search ?? args.search ?? '').trim();
        if (isActive !== undefined) filter.isActive = isActive === 'true' || isActive === true;
        if (campusId) filter['campusAccess.campusId'] = campusId;
        if (search) {
          filter.$or = [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ];
        }
        const profiles = await IdentityRepo.listProfiles(tenantId, filter);
        return {
          edges: profiles.map(p => {
            const node = toGqlProfile(p) as Record<string, unknown>;
            return { cursor: String(node.id), node };
          }),
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      }

      case 'getUser':
      case 'GET:/api/admin/users/:id': {
        const tenantId = resolveTenantId();
        return toGql(await IdentityRepo.findProfileById(tenantId, args.id as string));
      }

      case 'createUser':
      case 'POST:/api/admin/users':
        return createUser(ctx, args as Parameters<typeof createUser>[1]);

      case 'updateUser':
      case 'PATCH:/api/admin/users/:id':
        return updateUser(ctx, {
          profileId: args.id as string,
          ...(args.input ?? args) as object,
        } as Parameters<typeof updateUser>[1]);

      case 'deactivateUser':
      case 'DELETE:/api/admin/users/:id':
        return deactivateUser(ctx, args.id as string);

      case 'reactivateUser':
      case 'POST:/api/admin/users/:id/reactivate': {
        authorize(ctx, 'identity.users.update');
        const tenantId = resolveTenantId();
        const updated  = await IdentityRepo.updateProfile(tenantId, args.id as string, { isActive: true });
        if (!updated) throw new AppError('NOT_FOUND', 'User not found');
        return true;
      }

      // ── Staff ─────────────────────────────────────────────────────────────
      case 'inviteStaff':
      case 'POST:/api/admin/staff': {
        const input = { ...((args.input ?? args) as Parameters<typeof inviteStaff>[1]) };
        if (ctx.isPlatformAdmin && !ctx.membership) {
          input.tenantId = (event.request as Record<string, Record<string, string>> | undefined)
            ?.headers?.['x-tenant-id'] ?? '';
        }
        return inviteStaff(ctx, input);
      }

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

      // ── Employee Records ───────────────────────────────────────────────────
      case 'listEmployees':
      case 'GET:/api/admin/employees': {
        authorize(ctx, 'identity.staff.read');
        const tenantId = resolveTenantId();
        const filter: Record<string, unknown> = { tenantId };
        if (args.staffType)   filter.staffType   = args.staffType;
        if (args.campusId)    filter.campusId     = args.campusId;
        if (args.isActive !== undefined) filter.isActive = args.isActive === 'true' || args.isActive === true;
        const docs = await Employee.find(filter).sort({ createdAt: -1 }).lean();
        return docs.map(d => toGql(d));
      }

      case 'getEmployee':
      case 'GET:/api/admin/employees/:id': {
        authorize(ctx, 'identity.staff.read');
        const tenantId = resolveTenantId();
        return toGql(await Employee.findOne({ tenantId, _id: args.id as string }).lean());
      }

      case 'updateEmployee':
      case 'PATCH:/api/admin/employees/:id': {
        authorize(ctx, 'identity.staff.update');
        const tenantId = resolveTenantId();
        const id = args.id as string;
        const update = (args.input as Record<string, unknown>) ?? (() => {
          const { id: _id, ...rest } = args as Record<string, unknown>;
          return rest;
        })();
        return toGql(await Employee.findOneAndUpdate(
          { tenantId, _id: id },
          { $set: update },
          { new: true }
        ).lean());
      }

      // ── Campus Access ──────────────────────────────────────────────────────
      case 'addCampusAccess':
      case 'POST:/api/admin/users/:id/campus-access': {
        authorize(ctx, 'identity.users.update');
        const tenantId  = resolveTenantId();
        const profileId = (args.userId ?? args.id) as string;
        const campusId  = args.campusId as string;
        const roleAtCampus = args.role as string | undefined;
        const profile = await IdentityRepo.findProfileById(tenantId, profileId);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const existing = (profile.campusAccess ?? []) as unknown as Array<Record<string, unknown>>;
        if (existing.some((ca) => ca.campusId?.toString() === campusId)) {
          throw new AppError('CONFLICT', 'User already has access to this campus');
        }
        return toGql(await IdentityRepo.updateProfile(tenantId, profileId, {
          campusAccess: [
            ...existing,
            { campusId, role: roleAtCampus, grantedAt: new Date() },
          ] as never,
        }));
      }

      case 'removeCampusAccess':
      case 'DELETE:/api/admin/users/:id/campus-access/:campusId': {
        authorize(ctx, 'identity.users.update');
        const tenantId  = resolveTenantId();
        const profileId = (args.id ?? args.profileId) as string;
        const campusId  = args.campusId as string;
        const profile = await IdentityRepo.findProfileById(tenantId, profileId);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const filtered = (profile.campusAccess ?? []).filter(
          (ca) => ca.campusId?.toString() !== campusId
        );
        await IdentityRepo.updateProfile(tenantId, profileId, { campusAccess: filtered as never });
        return true;
      }

      case 'listCampusAccess':
      case 'GET:/api/admin/users/:id/campus-access': {
        const tenantId = resolveTenantId();
        const profile  = await IdentityRepo.findProfileById(tenantId, args.id as string);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        return profile.campusAccess ?? [];
      }

      // ── Roles ──────────────────────────────────────────────────────────────
      case 'listRoles': {
        return [
          { id: 'TENANT_ADMIN', roleName: 'Tenant Admin', permissions: ['*'], description: 'Full access to all tenant features' },
          { id: 'PRINCIPAL',    roleName: 'Principal',    permissions: ['academics.*', 'admissions.*', 'finance.read'], description: 'School principal' },
          { id: 'TEACHER',      roleName: 'Teacher',      permissions: ['academics.classes.read', 'academics.attendance.mark', 'academics.exams.update'], description: 'Class teacher / subject teacher' },
          { id: 'ACCOUNTANT',   roleName: 'Accountant',   permissions: ['finance.*'], description: 'Finance and fee management' },
          { id: 'ADMISSIONS_OFFICER', roleName: 'Admissions Officer', permissions: ['admissions.*'], description: 'Manages enquiries and applications' },
          { id: 'RECEPTIONIST', roleName: 'Receptionist', permissions: ['admissions.enquiry.*', 'admissions.application.read'], description: 'Front-desk reception' },
          { id: 'STAFF',        roleName: 'Staff',        permissions: ['academics.read'], description: 'General staff with read-only access' },
        ];
      }

      case 'assignRole':
      case 'POST:/api/admin/users/:id/roles': {
        authorize(ctx, 'identity.roles.assign');
        const tenantId = resolveTenantId();
        const targetId = (args.userId ?? args.id) as string;
        const profile  = await IdentityRepo.findProfileById(tenantId, targetId);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const roles        = (profile.roles ?? []) as unknown as Array<Record<string, unknown>>;
        const roleName     = (args.role ?? args.roleId) as string;
        const campusId     = args.campusId as string | undefined;
        if (roles.some((r) => r.role === roleName && r.campusId?.toString() === campusId)) {
          throw new AppError('CONFLICT', 'Role already assigned');
        }
        roles.push({ role: roleName, campusId, assignedAt: new Date(), assignedBy: ctx.membership!.profileId });
        return toGql(await IdentityRepo.updateProfile(tenantId, targetId, {
          roles: roles as never,
        }));
      }

      case 'removeRole':
      case 'DELETE:/api/admin/users/:id/roles/:role': {
        authorize(ctx, 'identity.roles.assign');
        const tenantId = resolveTenantId();
        const profile  = await IdentityRepo.findProfileById(tenantId, args.id as string);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const filtered = (profile.roles ?? []).filter(
          (r) => (r as unknown as Record<string, unknown>).role !== args.role
        );
        await IdentityRepo.updateProfile(tenantId, args.id as string, {
          roles: filtered as never,
        });
        return true;
      }

      // ── Impersonation (platform admin only) ────────────────────────────────
      case 'impersonateUser':
      case 'POST:/api/platform/impersonate': {
        if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
        const targetUserId = args.userId as string;
        const targetProfile = await Profile.findOne({ _id: targetUserId }).lean() as unknown as Record<string, unknown> | null;
        if (!targetProfile) throw new AppError('NOT_FOUND', 'Target user not found');
        console.warn(`[IMPERSONATION] Platform admin ${ctx.userId} impersonating ${targetUserId}`);
        return { targetProfile, note: 'Use Cognito Admin APIs to obtain token for this user' };
      }

      // ── Self-service profile ───────────────────────────────────────────────
      case 'updateMyProfile':
      case 'PATCH:/api/me': {
        const tenantId = ctx.membership?.tenantId;
        if (!tenantId) throw new AppError('BAD_REQUEST', 'No tenant context');
        const profileId = ctx.membership!.profileId;
        const rawInput = (args.input as Record<string, unknown>) ?? args;
        const { isActive: _ia, personaRole: _pr, roleAssignments: _ra, campusAccess: _ca, ...safeUpdate } =
          rawInput as Record<string, unknown>;
        return toGql(await IdentityRepo.updateProfile(tenantId, profileId, safeUpdate as never));
      }

      case 'uploadAvatar':
      case 'POST:/api/me/avatar': {
        const tenantId = ctx.membership?.tenantId ?? 'platform';
        const key      = `${tenantId}/avatars/${ctx.userId}-${Date.now()}.jpg`;
        return {
          key,
          contentType: (args.contentType as string) ?? 'image/jpeg',
        };
      }

      case 'uploadTenantLogo':
      case 'POST:/api/admin/settings/logo': {
        authorize(ctx, 'tenant.settings.update');
        const tenantId = resolveTenantId();
        const key      = `${tenantId}/logos/tenant-logo-${Date.now()}.png`;
        return {
          key,
          contentType: (args.contentType as string) ?? 'image/png',
        };
      }

      case 'resendInvite':
      case 'POST:/api/admin/staff/:id/resend-invite': {
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

      case 'acceptInvite':
      case 'POST:/api/auth/accept-invite': {
        const token = args.token as string;
        if (!token) throw new AppError('BAD_REQUEST', 'token is required');
        const authUser = await IdentityRepo.findAuthUserByEmail(token);
        if (!authUser) {
          const profileById = await Profile.findById(token).lean() as unknown as Record<string, unknown> | null;
          if (!profileById) throw new AppError('NOT_FOUND', 'Invalid or expired invite token');
          return {
            success:        true,
            email:          profileById.email as string,
            isExistingUser: !!(authUser),
          };
        }
        const isExistingUser = !!authUser.cognitoSub;
        return {
          success: true,
          email:   authUser.email,
          isExistingUser,
        };
      }

      // ── Bulk operations ────────────────────────────────────────────────────
      case 'bulkDeactivateUsers':
      case 'POST:/api/admin/users/bulk-deactivate': {
        authorize(ctx, 'identity.users.delete');
        const tenantId  = resolveTenantId();
        const userIds   = args.userIds as string[];
        if (!Array.isArray(userIds) || userIds.length === 0) {
          throw new AppError('BAD_REQUEST', 'userIds array is required');
        }
        const result = await Profile.updateMany(
          { tenantId, _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } },
          { $set: { isActive: false } }
        );
        return { modifiedCount: result.modifiedCount };
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[identity-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
