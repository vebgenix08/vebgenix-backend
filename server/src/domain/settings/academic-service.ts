import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../identity/entities';
import { IdentityService } from '../identity/services';

export class AcademicService {
  static async createAcademicYear(ctx: AuthContext, input: { name: string; startDate: string; endDate: string }) {
    IdentityService.authorize(ctx, 'settings.academic.manage');
    const prisma = await getPrisma();
    
    return prisma.academicYear.create({
      data: {
        tenantId: ctx.membership!.tenantId,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate)
      }
    });
  }

  static async listAcademicYears(ctx: AuthContext) {
    IdentityService.authorize(ctx, 'settings.view');
    const prisma = await getPrisma();
    
    return prisma.academicYear.findMany({
      where: { tenantId: ctx.membership!.tenantId },
      orderBy: { startDate: 'desc' }
    });
  }
  
  // Program Management
  static async createProgram(ctx: AuthContext, input: { name: string; type?: string }) {
    IdentityService.authorize(ctx, 'settings.academic.manage');
    const prisma = await getPrisma();
    
    return prisma.program.create({
      data: {
        tenantId: ctx.membership!.tenantId,
        name: input.name,
        type: input.type
      }
    });
  }
}
