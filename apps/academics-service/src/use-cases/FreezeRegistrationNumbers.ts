import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export interface FreezeRegistrationNumbersInput {
  academicYearId: string;
  campusId: string;
  gradeId: string;
}

export class FreezeRegistrationNumbers {
  static async execute(ctx: AuthContext, input: FreezeRegistrationNumbersInput) {
    authorize(ctx, 'academics.registration.freeze');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    const batch = await AcademicsRepo.findOrCreateRegistrationBatch(
      tenantId,
      input.academicYearId,
      input.campusId,
      input.gradeId,
    );

    if (batch.status === 'FROZEN') {
      throw new AppError('CONFLICT', 'Registration numbers are already frozen');
    }
    if (batch.status !== 'GENERATED') {
      throw new AppError('BAD_REQUEST', 'Registration numbers must be generated before freezing');
    }

    const updated = await AcademicsRepo.updateRegistrationBatch(tenantId, batch._id.toString(), {
      status:   'FROZEN',
      frozenAt: new Date(),
      frozenBy: new Types.ObjectId(profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'REGISTRATION_NUMBERS_FROZEN',
      entityType: 'AcademicRegistrationBatch', entityId: batch._id.toString(),
      after: { academicYearId: input.academicYearId, campusId: input.campusId, gradeId: input.gradeId },
    });

    return updated;
  }
}
