import { TenantDbClient } from '../../infrastructure/prisma/client';
import { AuthContext } from './entities';
import { IdentityService } from './services';

export class StaffService {
  static async listStaff(db: TenantDbClient, ctx: AuthContext, params: { 
    search?: string; 
    roleId?: string; 
    campusId?: string;
    limit?: number;
    cursor?: string;
  }) {
    IdentityService.authorize(ctx, 'staff.view');

    const { search, roleId, campusId, limit = 20, cursor } = params;

    const where: any = {
      status: { in: ['ACTIVE', 'INVITED', 'DISABLED'] }, 
    };

    if (!ctx.hasAllCampusesAccess) {
      const viewerCampuses = Array.from(ctx.allowedCampusIds);
      
      where.primaryProfile = {
        OR: [
          { allCampusesAccess: true },
          { campusAccess: { some: { campusId: { in: viewerCampuses } } } }
        ]
      };
    } else if (campusId) {
      where.primaryProfile = {
        campusAccess: { some: { campusId } }
      };
    }

    if (roleId) {
      where.memberRoles = { some: { roleId } };
    }

    if (search) {
      where.OR = [
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { primaryProfile: { fullName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const members = await db.tenantMembership.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        user: { select: { email: true, phone: true } },
        primaryProfile: { select: { fullName: true } },
        memberRoles: { include: { role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.user.email,
      phone: m.user.phone,
      fullName: m.primaryProfile?.fullName || 'Pending Invite',
      status: m.status,
      roles: m.memberRoles.map(mr => ({ id: mr.role.id, name: mr.role.name })),
      isPrimaryOwner: m.isPrimaryAdmin,
      joinedAt: m.activatedAt,
      invitedAt: m.invitedAt
    }));
  }

  static async getStaffDetails(db: TenantDbClient, ctx: AuthContext, membershipId: string) {
    IdentityService.authorize(ctx, 'staff.view');
    
    const member = await db.tenantMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: true,
        primaryProfile: { include: { campusAccess: true } },
        memberRoles: { include: { role: true } }
      }
    });

    if (!member) {
      return null;
    }

    return {
      ...member,
      fullName: member.primaryProfile?.fullName,
      campusAccess: member.primaryProfile?.campusAccess.map(ca => ca.campusId) ?? [],
      allCampusesAccess: member.primaryProfile?.allCampusesAccess ?? false
    };
  }
}
