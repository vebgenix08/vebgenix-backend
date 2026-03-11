import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../identity/entities';
import { IdentityService } from '../identity/services';

export class FinanceService {
  static async createFeeHead(ctx: AuthContext, name: string, type: 'RECURRING' | 'ONE_TIME') {
    IdentityService.authorize(ctx, 'finance.manage');
    const prisma = await getPrisma();
    
    return prisma.feeHead.create({
      data: {
        tenantId: ctx.membership!.tenantId,
        name,
        type
      }
    });
  }

  static async createFeeStructure(ctx: AuthContext, name: string) {
    IdentityService.authorize(ctx, 'finance.manage');
    const prisma = await getPrisma();
    
    return prisma.feeStructure.create({
      data: {
        tenantId: ctx.membership!.tenantId,
        name
      }
    });
  }
}
