import { IdentityRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { toGql } from '../identity-utils';

export async function handleCampusAccess(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  switch (operation) {
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
    default:
      return undefined;
  }
}
