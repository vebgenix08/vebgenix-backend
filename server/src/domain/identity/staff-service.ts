import { getPrisma } from '../../../infrastructure/prisma/client';
import { AuthContext } from './entities';
import { IdentityService } from './services';

export class StaffService {
  static async listStaff(ctx: AuthContext, params: { 
    search?: string; 
    roleId?: string; 
    campusId?: string;
    limit?: number;
    cursor?: string;
  }) {
    const prisma = await getPrisma();
    
    // 1. Authorization
    IdentityService.authorize(ctx, 'staff.view');

    const tenantId = ctx.membership!.tenantId;
    const { search, roleId, campusId, limit = 20, cursor } = params;

    // 2. Build Where Clause
    const where: any = {
      tenantId,
      // We generally want to see INVITED and ACTIVE staff
      status: { in: ['ACTIVE', 'INVITED', 'DISABLED'] }, 
    };

    // 3. Campus Scope Logic
    // If the viewer is restricted to specific campuses, they should only see staff 
    // who are relevant to those campuses (intersection).
    // Note: Global staff (allCampusesAccess=true) are usually visible to everyone.
    
    if (!ctx.hasAllCampusesAccess) {
      const viewerCampuses = Array.from(ctx.allowedCampusIds);
      
      where.primaryProfile = {
        OR: [
          { allCampusesAccess: true }, // Global staff are visible
          { campusAccess: { some: { campusId: { in: viewerCampuses } } } } // Overlapping staff
        ]
      };
    } else if (campusId) {
      // Admin filtering by specific campus
      where.primaryProfile = {
        campusAccess: { some: { campusId } }
      };
    }

    // 4. Role Filter
    if (roleId) {
      where.memberRoles = { some: { roleId } };
    }

    // 5. Search (Email or Name)
    if (search) {
      where.OR = [
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { primaryProfile: { fullName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    // 6. Execute Query
    const members = await prisma.tenantMembership.findMany({
      where,
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        user: { select: { email: true, phone: true } },
        primaryProfile: { select: { fullName: true, avatar: true } }, // Assuming avatar exists or will exist
        memberRoles: { include: { role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 7. Map Response
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

  static async getStaffDetails(ctx: AuthContext, membershipId: string) {
    const prisma = await getPrisma();

    IdentityService.authorize(ctx, 'staff.view');
    
    // Add similar scope checks if needed (can I view this specific person?)
    // For now, assume listStaff scope logic covers generic access rights.
    
    const member = await prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      include: {
        user: true,
        primaryProfile: { include: { campusAccess: true } },
        memberRoles: { include: { role: true } }
      }
    });

    if (!member || member.tenantId !== ctx.membership!.tenantId) {
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
