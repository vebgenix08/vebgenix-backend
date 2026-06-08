import { IdentityRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { buildRoleAssignments, toGql, toGqlProfile } from '../identity-utils';

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
    roles:          buildRoleAssignments(input.roleIds),
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

async function reactivateUser(ctx: AuthContext, profileId: string, resolveTenantId: ResolveTenantId) {
  authorize(ctx, 'identity.users.update');
  const tenantId = resolveTenantId();
  const updated  = await IdentityRepo.updateProfile(tenantId, profileId, { isActive: true });
  if (!updated) throw new AppError('NOT_FOUND', 'User not found');
  return true;
}

async function bulkDeactivateUsers(ctx: AuthContext, args: Record<string, unknown>, resolveTenantId: ResolveTenantId) {
  authorize(ctx, 'identity.users.delete');
  const tenantId  = resolveTenantId();
  const userIds   = args.userIds as string[];
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new AppError('BAD_REQUEST', 'userIds array is required');
  }
  const { Profile } = await import('@vebgenix/db');
  const result = await Profile.updateMany(
    { tenantId, _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } },
    { $set: { isActive: false } }
  );
  return { modifiedCount: result.modifiedCount };
}

export async function handleUsers(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  switch (operation) {
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
    case 'POST:/api/admin/users/:id/reactivate':
      return reactivateUser(ctx, args.id as string, resolveTenantId);
    case 'bulkDeactivateUsers':
    case 'POST:/api/admin/users/bulk-deactivate':
      return bulkDeactivateUsers(ctx, args, resolveTenantId);
    default:
      return undefined;
  }
}
