import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../../domain/identity/entities';
import { IdentityService } from '../../domain/identity/services';
import { AppError } from '../../domain/shared/errors';

export class InviteStaff {
  static async execute(ctx: AuthContext, input: {
    email: string;
    fullName: string;
    roleIds: string[];
    campusIds?: string[];
    allCampuses?: boolean;
  }) {
    const prisma = await getPrisma();

    // 1. Authorization
    IdentityService.authorize(ctx, 'staff.invite');

    const { email, fullName, roleIds } = input;
    const tenantId = ctx.membership!.tenantId;

    // 2. Transactional Execution
    return await prisma.$transaction(async (tx) => {
      // A. Find or Create User (Idempotent)
      let user = await tx.authUser.findUnique({ where: { email } });
      
      if (!user) {
        user = await tx.authUser.create({
          data: { 
            email, 
            status: 'ACTIVE' // User is active, but needs password setup via invite flow
          }
        });
      }

      // B. Check Existing Membership
      // Note: The unique constraint is [userId, tenantId, role]. 
      // Since we don't set 'role' (it's deprecated/null), this effectively checks for any membership 
      // with null role. Ideally, we should have cleaned up the unique constraint, 
      // but this works for now as we transition away from the enum.
      const existing = await tx.tenantMembership.findFirst({
        where: { userId: user.id, tenantId }
      });

      if (existing) {
        throw new AppError('ALREADY_EXISTS', 'User is already a member of this tenant');
      }

      // C. Create Profile (Tenant specific identity)
      const profile = await tx.profile.create({
        data: {
          tenantId,
          email,
          fullName,
          isActive: true,
          allCampusesAccess: input.allCampuses ?? false,
          campusAccess: {
            create: (input.campusIds || []).map(cid => ({ campusId: cid, tenantId }))
          }
        }
      });

      // D. Create Membership with Roles
      const membership = await tx.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          primaryProfileId: profile.id,
          status: 'INVITED',
          invitedByUserId: ctx.user.id,
          invitedAt: new Date(),
          memberRoles: {
            create: roleIds.map(rid => ({ roleId: rid }))
          }
        }
      });

      // E. Link User -> Profile
      await tx.userProfileLink.create({
        data: { userId: user.id, profileId: profile.id }
      });

      // TODO: Emit EventBridge event 'Identity.StaffInvited' here for email worker
      
      return { 
        success: true,
        membershipId: membership.id,
        userId: user.id 
      };
    });
  }
}
