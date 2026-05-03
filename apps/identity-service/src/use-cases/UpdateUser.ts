import { AuthContext } from '@vebgenix/auth';
import { IdentityRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';

export interface UpdateUserInput {
  profileId: string;
  fullName?: string;
  phone?: string;
  isActive?: boolean;
  isAllCampuses?: boolean;
}

export class UpdateUser {
  static async execute(ctx: AuthContext, input: UpdateUserInput) {
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
}
