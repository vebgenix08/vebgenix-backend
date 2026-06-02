import { IdentityRepo, Tenant } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { toGqlProfile } from '../identity-utils';

type MembershipContext = AuthContext & {
  memberships?: Array<{
    tenantId: string;
    profileId: string;
    isAllCampuses: boolean;
    isPrimaryOwner: boolean;
    campusIds: string[];
    personaRole?: string;
    roles: Array<{
      roleId: { toString?: () => string } | null;
      roleName: string;
      permissions: string[];
    }>;
  }>;
};

async function buildMembershipPayload(ctx: AuthContext) {
  const memberships = ((ctx as MembershipContext).memberships ?? (ctx.membership ? [ctx.membership] : []));
  const tenantIds = memberships.map((membership) => membership.tenantId);
  const tenantDocs = tenantIds.length
    ? await Tenant.find({ tenantId: { $in: tenantIds } }).select('tenantId name slug isActive').lean()
    : [];
  const tenantMap = new Map(
    tenantDocs.map((tenant) => [String((tenant as Record<string, unknown>).tenantId ?? ''), tenant as Record<string, unknown>]),
  );
  return memberships.map((membership) => {
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
}

async function me(ctx: AuthContext) {
  const memberships = await buildMembershipPayload(ctx);
  const tenantId = ctx.membership?.tenantId;
  if (!tenantId) {
    return {
      id: ctx.userId,
      email: ctx.email,
      isPlatformAdmin: ctx.isPlatformAdmin,
      permissions: [],
      roles: [],
      roleAssignments: [],
      memberships,
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
      memberships,
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
    memberships,
  };
}

async function updateMyProfile(ctx: AuthContext, args: Record<string, unknown>) {
  const tenantId = ctx.membership?.tenantId;
  if (!tenantId) throw new AppError('BAD_REQUEST', 'No tenant context');
  const profileId = ctx.membership!.profileId;
  const rawInput = (args.input as Record<string, unknown>) ?? args;
  const { isActive: _ia, personaRole: _pr, roleAssignments: _ra, campusAccess: _ca, ...safeUpdate } =
    rawInput as Record<string, unknown>;
  return toGqlProfile(await IdentityRepo.updateProfile(tenantId, profileId, safeUpdate as never));
}

export async function handleProfile(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
): Promise<unknown> {
  switch (operation) {
    case 'me':
    case 'GET:/api/me':
      return me(ctx);
    case 'updateMyProfile':
    case 'PATCH:/api/me':
      return updateMyProfile(ctx, args);
    default:
      return undefined;
  }
}
