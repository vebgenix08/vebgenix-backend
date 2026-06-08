import { IdentityRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { AuthContext } from './AuthContext';

const ROLE_PERMISSION_FALLBACK: Record<string, string[]> = {
  TENANT_ADMIN: ['*'],
  PRINCIPAL: ['academics.*', 'admissions.*', 'finance.read'],
  TEACHER: ['academics.classes.read', 'academics.attendance.mark', 'academics.exams.update'],
  ACCOUNTANT: ['finance.*'],
  ADMISSIONS_OFFICER: ['admissions.*'],
  RECEPTIONIST: ['admissions.enquiry.*', 'admissions.application.read'],
  STAFF: ['academics.read'],
};

/**
 * Cognito identity claims — the shape AppSync puts in event.identity.claims
 * and what aws-jwt-verify returns after verifying an Access/ID token.
 */
export interface CognitoIdentityClaims {
  sub: string;                      // Cognito user UUID — our primary link key
  email?: string;
  'cognito:groups'?: string[];
  'custom:tenantId'?: string;       // optional custom attribute set on the Cognito user
  [key: string]: unknown;
}

/**
 * Build the application-level AuthContext from verified Cognito claims.
 *
 * Lookup order:
 *   1. Find AuthUser by cognitoSub (the normal path after first login)
 *   2. If not found and email is present, auto-upsert (lazy sync on first AppSync call).
 *      This handles the window between PostConfirmation firing and the sync Lambda running.
 */
export async function buildAuthContext(
  claims: CognitoIdentityClaims,
  tenantId?: string,
): Promise<AuthContext> {
  const { sub, email } = claims;
  if (!sub) throw new AppError('UNAUTHORIZED', 'No sub in Cognito claims');

  let authUser = await IdentityRepo.findAuthUserByCognitoSub(sub);

  if (!authUser) {
    if (!email) throw new AppError('UNAUTHORIZED', 'User not found — no email in claims for auto-sync');
    // First call after Cognito signup: lazily sync the user into MongoDB
    authUser = await IdentityRepo.upsertByCognitoSub({ cognitoSub: sub, email });
  }

  if (!authUser.isActive) {
    throw new AppError('UNAUTHORIZED', 'User account is deactivated');
  }

  const ctx: AuthContext = {
    userId:           authUser._id.toString(),
    email:            authUser.email ?? '',
    fullName:         '',
    isPlatformAdmin:  authUser.isPlatformAdmin,
    permissions:      new Set<string>(),
    allowedCampusIds: new Set<string>(),
  };

  const normalizeRoleName = (role: { roleName?: string; role?: string } | null | undefined) =>
    String(role?.roleName ?? role?.role ?? '').trim();

  const profiles = await IdentityRepo.listProfilesByAuthUserId(authUser._id.toString(), {
    isActive: true,
  });

  ctx.memberships = profiles.map((profile) => ({
    tenantId:       profile.tenantId,
    profileId:      profile._id.toString(),
    isAllCampuses:  profile.isAllCampuses,
    isPrimaryOwner: profile.isPrimaryOwner,
    campusIds:      profile.campusAccess.map((c) => c.campusId.toString()),
    personaRole:    profile.personaRole,
    roles:          profile.roles.map((r) => ({
      roleId:      r.roleId,
      roleName:    r.roleName,
      permissions: r.permissions,
    })),
  }));

  // The tenantId can come from:
  //   1. Caller-supplied (e.g. x-tenant-id header)
  //   2. custom:tenantId Cognito attribute
  //   3. implicit single active membership for tenant users
  const claimedTenantId = tenantId ?? claims['custom:tenantId'];
  const resolvedMembership = claimedTenantId
    ? ctx.memberships.find((membership) => membership.tenantId === claimedTenantId)
    : ctx.memberships.length === 1
      ? ctx.memberships[0]
      : undefined;

  if (resolvedMembership) {
    const profile = profiles.find((item) => item.tenantId === resolvedMembership.tenantId);
    if (profile) {
      ctx.fullName         = profile.fullName;
      const allPerms: string[] = [];
      for (const role of profile.roles) {
        const fallbackPermissions = ROLE_PERMISSION_FALLBACK[normalizeRoleName(role).toUpperCase()];
        if (role.permissions?.length) {
          allPerms.push(...role.permissions);
        }
        if (fallbackPermissions?.length) {
          allPerms.push(...fallbackPermissions);
        }
      }
      ctx.permissions      = new Set(allPerms);
      ctx.allowedCampusIds = new Set(profile.campusAccess.map(c => c.campusId.toString()));
      ctx.membership = resolvedMembership;
    }
  }

  return ctx;
}
