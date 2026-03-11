import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../identity/entities';
import { IdentityService } from '../identity/services';
import { AppError } from '../shared/errors';

export class TemplateService {
  static async createTemplate(ctx: AuthContext, input: { type: string; name: string }) {
    IdentityService.authorize(ctx, 'settings.templates.manage');
    const prisma = await getPrisma();
    
    // Validate enum if needed, or let Prisma throw
    return prisma.template.create({
      data: {
        tenantId: ctx.membership!.tenantId,
        type: input.type as any,
        name: input.name
      }
    });
  }
  
  static async publishVersion(ctx: AuthContext, input: { templateId: string; content: any }) {
    IdentityService.authorize(ctx, 'settings.templates.manage');
    const prisma = await getPrisma();
    
    // Validate template belongs to tenant
    const template = await prisma.template.findUnique({ where: { id: input.templateId } });
    if (!template || template.tenantId !== ctx.membership!.tenantId) {
      throw new AppError('NOT_FOUND', 'Template not found');
    }
    
    // Find latest version
    const latest = await prisma.templateVersion.findFirst({
      where: { templateId: input.templateId },
      orderBy: { version: 'desc' }
    });
    
    const newVersion = (latest?.version || 0) + 1;
    
    return prisma.templateVersion.create({
      data: {
        templateId: input.templateId,
        version: newVersion,
        content: input.content,
        isPublished: true
      }
    });
  }

  static async listTemplates(ctx: AuthContext, type?: string) {
    IdentityService.authorize(ctx, 'settings.view');
    const prisma = await getPrisma();
    
    return prisma.template.findMany({
      where: { 
        tenantId: ctx.membership!.tenantId,
        type: type ? (type as any) : undefined
      },
      orderBy: { name: 'asc' }
    });
  }
}
