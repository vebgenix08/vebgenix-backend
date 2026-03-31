import { AuthContext } from '../identity/entities';
import { AppError } from '../shared/errors';
import { TenantDbClient } from '../../infrastructure/prisma/client';
import { IdentityService } from '../identity/services';
import * as crypto from 'crypto';
import { EmailService } from '../../infrastructure/email/email-service';

export class StudentPortalService {
  
  static async enablePortal(
    db: TenantDbClient,
    ctx: AuthContext,
    studentId: string,
    email: string
  ) {
    // 1. Authorization
    IdentityService.authorize(ctx, 'student.edit'); // Assuming edit permission covers portal enablement
    const tenantId = ctx.membership!.tenantId;

    const student = await db.student.findUnique({
      where: { id: studentId }
    });

    if (!student || student.tenantId !== tenantId) {
      throw new AppError('NOT_FOUND', 'Student not found');
    }

    const existingLink = await db.studentAuthLink.findUnique({
      where: { studentId }
    });
    if (existingLink) {
      throw new AppError('ALREADY_ENABLED', 'Student portal already enabled');
    }

    const normalizedEmail = email.toLowerCase().trim();

    let authUser = await db.authUser.findUnique({ where: { email: normalizedEmail } });
    
    if (!authUser) {
      authUser = await db.authUser.create({
        data: {
          email: normalizedEmail,
          status: 'ACTIVE',
        }
      });
    }

    await db.studentAuthLink.create({
      data: {
        tenantId,
        studentId,
        authUserId: authUser.id
      }
    });

    const tokenRaw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenRaw).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    await db.passwordResetToken.create({
      data: {
        userId: authUser.id,
        tenantId,
        purpose: 'INVITE_SET_PASSWORD',
        tokenHash,
        expiresAt
      }
    });

    await EmailService.sendInviteEmail(normalizedEmail, tokenRaw, 'STUDENT');

    return { success: true };
  }
}
