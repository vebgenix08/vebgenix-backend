import { IdentityRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { AuthContext } from './AuthContext';

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

  // The tenantId can come from:
  //   1. Caller-supplied (e.g. x-tenant-id header)
  //   2. custom:tenantId Cognito attribute (set when a user is assigned to a tenant)
  const resolvedTenantId = tenantId ?? claims['custom:tenantId'];

  const ctx: AuthContext = {
    userId:           authUser._id.toString(),
    email:            authUser.email ?? '',
    fullName:         '',
    isPlatformAdmin:  authUser.isPlatformAdmin,
    permissions:      new Set<string>(),
    allowedCampusIds: new Set<string>(),
  };

  if (resolvedTenantId) {
    const profile = await IdentityRepo.findProfileByAuthUserId(resolvedTenantId, authUser._id.toString());
    if (profile && profile.isActive) {
      ctx.fullName         = profile.fullName;
      const allPerms: string[] = [];
      for (const role of profile.roles) allPerms.push(...role.permissions);
      ctx.permissions      = new Set(allPerms);
      ctx.allowedCampusIds = new Set(profile.campusAccess.map(c => c.campusId.toString()));
      ctx.membership = {
        tenantId:       resolvedTenantId,
        profileId:      profile._id.toString(),
        isAllCampuses:  profile.isAllCampuses,
        isPrimaryOwner: profile.isPrimaryOwner,
        campusIds:      profile.campusAccess.map(c => c.campusId.toString()),
        roles:          profile.roles.map(r => ({
          roleId:      r.roleId,
          roleName:    r.roleName,
          permissions: r.permissions,
        })),
      };
    }
  }

  return ctx;
}
