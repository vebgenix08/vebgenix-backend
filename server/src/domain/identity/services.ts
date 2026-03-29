import { getPrisma, runWithTenantContext } from '../../infrastructure/prisma/client';
import { User, Membership, Role, MembershipStatus, AuthContext } from './entities';
import { AuthorizationError, NotFoundError } from '../shared/errors';

async function findAuthUserByEmailInsensitive(prisma: any, email?: string | null) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  if (!normalizedEmail) return null;

  return prisma.authUser.findFirst({
    where: {
      email: {
        equals: normalizedEmail,
        mode: 'insensitive',
      },
    },
    include: { globalRoles: true },
  });
}

export class IdentityService {
  /**
   * Resolve the full AuthContext for a user within a tenant.
   * This is the "God Function" for authorization used by every Lambda.
   */
  static async getContext(userId: string, tenantId?: string, email?: string): Promise<AuthContext> {
    const prisma = await getPrisma();

    // 1. Fetch User
    let userRecord = await prisma.authUser.findUnique({
      where: { id: userId },
      include: { globalRoles: true }
    });

    // 1b. Fallback: If AppSync sends a Cognito `sub` as userId that doesn't match our Postgres ID,
    // look up the AuthUser by email and seamlessly translate the userId for subsequent queries.
    if (!userRecord && email) {
      userRecord = await findAuthUserByEmailInsensitive(prisma, email);

      if (userRecord) {
        userId = userRecord.id; // Override userId so subsequent membership/profile queries use the local DB ID
      }
    }

    if (!userRecord) throw new NotFoundError('User', userId);

    const user: User = {
      id: userRecord.id,
      email: userRecord.email,
      fullName: '', // To be filled from Profile if available
      isPlatformAdmin: userRecord.globalRoles.some(r => r.role === 'PLATFORM_SUPER_ADMIN')
    };

    // If no tenant context needed (e.g. platform admin), return basic user context
    if (!tenantId) {
      return { 
        user, 
        permissions: new Set<string>(), 
        allowedCampusIds: new Set<string>(), 
        hasAllCampusesAccess: false 
      };
    }

    // 2. Fetch Membership with Roles and Profile
    const membershipRecord = await runWithTenantContext(tenantId, userId, (db) => {
      return db.tenantMembership.findFirst({
        where: { userId, tenantId },
        include: {
          memberRoles: {
            include: {
              role: {
                include: { permissions: true }
              }
            }
          },
          primaryProfile: {
            include: { campusAccess: true }
          }
        }
      });
    });

    if (!membershipRecord) {
       throw new AuthorizationError('User is not a member of this tenant');
    }

    if (membershipRecord.status !== 'ACTIVE') {
      throw new AuthorizationError(`User membership is ${membershipRecord.status}`);
    }

    // 3. Resolve Roles & Permissions
    const roles: Role[] = membershipRecord.memberRoles.map(mr => ({
      id: mr.role.id,
      name: mr.role.name,
      isSystem: mr.role.isSystem,
      permissions: new Set(mr.role.permissions.map(p => p.permissionKey))
    }));

    const permissions = new Set<string>();
    roles.forEach(r => r.permissions.forEach(p => permissions.add(p)));

    let profile = membershipRecord.primaryProfile;
    if (!profile) {
      const fallback = await runWithTenantContext(tenantId, userId, (db) =>
        db.profile.findUnique({
          where: { id: userId },
          include: { campusAccess: true },
        }),
      );
      if (fallback?.tenantId === tenantId) {
        profile = fallback as any;
      }
    }

    if (profile) {
      user.fullName = profile.fullName || user.email;
    }

    const isAllCampuses = profile?.allCampusesAccess ?? false;
    const allowedCampusIds = new Set<string>(
      profile?.campusAccess.map((ca: any) => ca.campusId) ?? [],
    );

    // 5. Construct Membership Object
    const membership: Membership = {
      id: membershipRecord.id,
      userId,
      tenantId,
      status: membershipRecord.status as MembershipStatus,
      roles,
      isAllCampuses,
      isPrimaryOwner: membershipRecord.isPrimaryAdmin,
      campusScope: allowedCampusIds
    };

    return {
      user,
      membership,
      permissions,
      allowedCampusIds,
      hasAllCampusesAccess: isAllCampuses
    };
  }

  /**
   * High-level authorization check helper.
   */
  static authorize(ctx: AuthContext, requiredPermission: string, targetCampusId?: string): void {
    if (ctx.user.isPlatformAdmin) return; // Super admin override
    if (ctx.membership?.isPrimaryOwner) return; // Tenant owner override

    // 1. Permission Check
    if (!ctx.permissions.has(requiredPermission)) {
      throw new AuthorizationError(`Missing permission: ${requiredPermission}`);
    }

    // 2. Campus Scope Check
    if (targetCampusId) {
      if (!ctx.hasAllCampusesAccess && !ctx.allowedCampusIds.has(targetCampusId)) {
        throw new AuthorizationError(`Access denied for campus ${targetCampusId}`);
      }
    }
  }
}
