import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../identity/entities';
import { IdentityService } from '../identity/services';

export class StudentService {
  static async listStudents(ctx: AuthContext, filter?: { search?: string }) {
    IdentityService.authorize(ctx, 'students.view');
    const prisma = await getPrisma();
    
    const where: any = { tenantId: ctx.membership!.tenantId };
    
    if (!ctx.hasAllCampusesAccess) {
      where.campusId = { in: Array.from(ctx.allowedCampusIds) };
    }
    
    if (filter?.search) {
      where.fullName = { contains: filter.search, mode: 'insensitive' };
    }
    
    return prisma.student.findMany({
      where,
      orderBy: { fullName: 'asc' }
    });
  }
}
