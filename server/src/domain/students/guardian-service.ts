import { AuthContext } from '../identity/entities';
import { AppError } from '../shared/errors';
import { TenantDbClient } from '../../infrastructure/prisma/client';
import { IdentityService } from '../identity/services';
import * as crypto from 'crypto';
import { EmailService } from '../../infrastructure/email/email-service';

export class GuardianPortalService {
  
  static async enablePortal(
    db: TenantDbClient,
    ctx: AuthContext,
    input: {
      studentId: string;
      guardianName: string;
      relationship: string;
      email: string;
      phone: string;
    }
  ) {
    // 1. Authorization
    IdentityService.authorize(ctx, 'student.edit');
    const tenantId = ctx.membership!.tenantId;
    const normalizedEmail = input.email.toLowerCase().trim();

    const student = await db.student.findUnique({
      where: { id: input.studentId }
    });

    if (!student || student.tenantId !== tenantId) {
      throw new AppError('NOT_FOUND', 'Student not found');
    }

    let guardian = await db.guardian.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone: input.phone
        }
      }
    });

    if (!guardian) {
      guardian = await db.guardian.create({
        data: {
          tenantId,
          fullName: input.guardianName,
          email: normalizedEmail,
          phone: input.phone,
          relationship: input.relationship
        }
      });
    } else {
      if (!guardian.email && normalizedEmail) {
        await db.guardian.update({
          where: { id: guardian.id },
          data: { email: normalizedEmail }
        });
      }
    }

    const link = await db.studentGuardian.findUnique({
      where: {
        studentId_guardianId: {
          studentId: student.id,
          guardianId: guardian.id
        }
      }
    });

    if (!link) {
      await db.studentGuardian.create({
        data: {
          tenantId,
          studentId: student.id,
          guardianId: guardian.id,
          isPrimary: true
        }
      });
    }

    const existingAuthLink = await db.guardianAuthLink.findUnique({
      where: { guardianId: guardian.id }
    });

    if (existingAuthLink) {
      return { success: true, message: 'Portal already enabled for this guardian' };
    }

    let authUser = await db.authUser.findUnique({ where: { email: normalizedEmail } });
    
    if (!authUser) {
      authUser = await db.authUser.create({
        data: {
          email: normalizedEmail,
          status: 'ACTIVE',
        }
      });
    }

    await db.guardianAuthLink.create({
      data: {
        tenantId,
        guardianId: guardian.id,
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

    await EmailService.sendInviteEmail(normalizedEmail, tokenRaw, 'GUARDIAN');

    return { success: true };
  }
}
