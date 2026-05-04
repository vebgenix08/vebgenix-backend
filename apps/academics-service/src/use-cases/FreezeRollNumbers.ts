import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export interface FreezeRollNumbersInput {
  academicYearId: string;
  campusId: string;
  gradeId: string;
  sectionId: string;
}

export class FreezeRollNumbers {
  static async execute(ctx: AuthContext, input: FreezeRollNumbersInput) {
    authorize(ctx, 'academics.rollno.freeze');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    const batch = await AcademicsRepo.findOrCreateRollNoBatch(
      tenantId,
      input.academicYearId,
      input.campusId,
      input.gradeId,
      input.sectionId,
    );

    if (batch.status === 'FROZEN') {
      throw new AppError('CONFLICT', 'Roll numbers are already frozen');
    }
    if (batch.status !== 'GENERATED') {
      throw new AppError('BAD_REQUEST', 'Roll numbers must be generated before freezing');
    }

    const updated = await AcademicsRepo.updateRollNoBatch(tenantId, batch._id.toString(), {
      status:   'FROZEN',
      frozenAt: new Date(),
      frozenBy: new Types.ObjectId(profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'ROLL_NUMBERS_FROZEN',
      entityType: 'AcademicRollNoBatch', entityId: batch._id.toString(),
      after: { academicYearId: input.academicYearId, sectionId: input.sectionId },
    });

    return updated;
  }
}
