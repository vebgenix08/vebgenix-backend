import { AuthContext } from '@vebgenix/auth';
import { IdentityRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';

export class DeactivateUser {
  static async execute(ctx: AuthContext, profileId: string) {
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

    return { success: true };
  }
}
