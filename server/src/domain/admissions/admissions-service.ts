import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../identity/entities';
import { IdentityService } from '../identity/services';
import { ApplicantService } from './applicant-service';
import { ApplicationWorkflow } from './workflows';
import { ApplicationStatus } from './entities';
import { AppError } from '../shared/errors';

export class AdmissionsService {
  static async createEnquiry(ctx: AuthContext, input: {
    fullName: string;
    phone: string;
    email?: string;
    dob?: string;
    grade?: string;
    campusId: string;
  }) {
    IdentityService.authorize(ctx, 'admissions.enquiry.create');
    const prisma = await getPrisma();
    
    // 1. Find/Create Applicant
    await ApplicantService.findOrCreate(ctx, {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      dob: input.dob ? new Date(input.dob) : undefined
    });

    // 2. Create Enquiry
    return prisma.enquiry.create({
      data: {
        tenantId: ctx.membership!.tenantId,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        studentDob: input.dob ? new Date(input.dob) : undefined,
        gradeApplied: input.grade || 'Unknown',
        campusId: input.campusId,
        campusScope: 'SCHOOL'
      }
    });
  }

  static async submitApplication(ctx: AuthContext, id: string) {
    IdentityService.authorize(ctx, 'admissions.application.edit');
    const prisma = await getPrisma();
    
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new AppError('NOT_FOUND', 'Application not found');
    
    // Workflow Check
    ApplicationWorkflow.assertTransition(
      app.status as ApplicationStatus, 
      ApplicationStatus.SUBMITTED
    );
    
    return prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.SUBMITTED,
        // Using Prisma Json specific handling usually requires constructing the object
        // For simplicity assuming raw object push works or we replace logic
        stageHistory: [...(app.stageHistory as any[] || []), { status: 'SUBMITTED', at: new Date() }] as any
      }
    });
  }
  
  static async listAdmissions(ctx: AuthContext) {
    IdentityService.authorize(ctx, 'admissions.view');
    const prisma = await getPrisma();
    
    // Enforce Campus Scope
    const where: any = { tenantId: ctx.membership!.tenantId };
    if (!ctx.hasAllCampusesAccess) {
      where.campusId = { in: Array.from(ctx.allowedCampusIds) };
    }
    
    return prisma.application.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
  }
}
