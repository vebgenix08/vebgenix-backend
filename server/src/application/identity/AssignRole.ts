import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../../domain/identity/entities';
import { IdentityService } from '../../domain/identity/services';
import { AppError } from '../../domain/shared/errors';

export class AssignRole {
  static async execute(ctx: AuthContext, input: {
    membershipId: string;
    roleIds: string[];
  }) {
    const prisma = await getPrisma();
    
    // 1. Authorization
    IdentityService.authorize(ctx, 'staff.assign_role');

    // 2. Fetch Target Membership
    const target = await prisma.tenantMembership.findUnique({
      where: { id: input.membershipId },
      include: { memberRoles: { include: { role: true } } }
    });

    if (!target || target.tenantId !== ctx.membership!.tenantId) {
      throw new AppError('NOT_FOUND', 'Staff member not found');
    }

    // 3. Validate Roles exist in this tenant
    const roles = await prisma.roleDefinition.findMany({
      where: { 
        id: { in: input.roleIds },
        tenantId: ctx.membership!.tenantId 
      }
    });

    if (roles.length !== input.roleIds.length) {
      throw new AppError('VALIDATION_ERROR', 'One or more roles do not exist in this tenant');
    }

    // 4. Execute Update
    return await prisma.$transaction(async (tx) => {
      // Remove existing roles
      await tx.memberRole.deleteMany({
        where: { membershipId: input.membershipId }
      });
      
      // Assign new roles
      await tx.memberRole.createMany({
        data: input.roleIds.map(rid => ({
          membershipId: input.membershipId,
          roleId: rid
        }))
      });
      
      return { success: true };
    });
  }
}
