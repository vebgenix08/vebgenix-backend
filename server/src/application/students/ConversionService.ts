import { getPrisma } from '../../infrastructure/prisma/client';
import { AuthContext } from '../../domain/identity/entities';
import { IdentityService } from '../../domain/identity/services';
import { AppError } from '../../domain/shared/errors';

export class ConversionService {
  static async convertToStudent(ctx: AuthContext, applicationId: string) {
    IdentityService.authorize(ctx, 'admissions.convert_to_student');
    const prisma = await getPrisma();
    
    // 1. Fetch Application & Offer
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { offer: true }
    });
    
    if (!app || app.tenantId !== ctx.membership!.tenantId) {
      throw new AppError('NOT_FOUND', 'Application not found');
    }
    
    if ((app.status as any) === 'ENROLLED') {
      throw new AppError('ALREADY_ENROLLED', 'Student already enrolled');
    }
    
    if (!app.offer) {
      throw new AppError('NO_OFFER', 'Cannot enroll without an offer');
    }
    
    // 2. Transaction
    return await prisma.$transaction(async (tx) => {
      // Create Student
      const student = await tx.student.create({
        data: {
          tenantId: app.tenantId,
          applicationId: app.id,
          fullName: app.fullName,
          email: app.email,
          parentEmail: app.fatherPhone || app.email, // Fallback
          registrationNumber: `REG-${Date.now()}`, // Simple generator for now
          campusId: app.campusId,
          campusType: 'SCHOOL' as any,
          currentGrade: app.gradeApplyingFor,
          status: 'ACTIVE' as any
        }
      });
      
      // Update Application
      await tx.application.update({
        where: { id: app.id },
        data: { status: 'ENROLLED' as any }
      });
      
      // TODO: Create Fee Assignment from Offer Snapshot
      
      return student;
    });
  }
}
