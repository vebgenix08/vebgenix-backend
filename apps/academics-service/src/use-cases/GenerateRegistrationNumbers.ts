import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo, Student, StudentAcademicEnrollment } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { formatNumberPadded } from '../academicNumbering';

export interface GenerateRegistrationNumbersInput {
  academicYearId: string;
  campusId: string;
  gradeId: string;
}

export class GenerateRegistrationNumbers {
  static async execute(ctx: AuthContext, input: GenerateRegistrationNumbersInput) {
    authorize(ctx, 'academics.registration.generate');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    const batch = await AcademicsRepo.findOrCreateRegistrationBatch(
      tenantId,
      input.academicYearId,
      input.campusId,
      input.gradeId,
    );

    if (batch.status === 'FROZEN') {
      throw new AppError('CONFLICT', 'Registration numbers are frozen for this grade and cannot be regenerated');
    }

    // Load all ACTIVE enrollments for this grade/year, joined with student for sort
    const enrollments = await StudentAcademicEnrollment.find({
      tenantId,
      academicYearId: new Types.ObjectId(input.academicYearId),
      campusId:       new Types.ObjectId(input.campusId),
      gradeId:        new Types.ObjectId(input.gradeId),
      status:         'ACTIVE',
    }).lean();

    if (enrollments.length === 0) {
      throw new AppError('BAD_REQUEST', 'No active enrollments found for this grade');
    }

    // Load students for alphabetical sort
    const studentIds = enrollments.map(e => e.studentId);
    const students = await Student.find({
      tenantId,
      _id: { $in: studentIds },
    }).lean();

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));

    // Sort alphabetically by fullName
    const sorted = [...enrollments].sort((a, b) => {
      const sa = studentMap.get(a.studentId.toString())?.fullName ?? '';
      const sb = studentMap.get(b.studentId.toString())?.fullName ?? '';
      return sa.localeCompare(sb);
    });

    let counter = 0;
    const updates: Array<{ enrollmentId: string; registrationNo: string }> = [];

    for (const enrollment of sorted) {
      counter++;
      const regNo = formatNumberPadded(counter, 3);
      updates.push({ enrollmentId: enrollment._id.toString(), registrationNo: regNo });
    }

    // Apply all updates
    for (const upd of updates) {
      await AcademicsRepo.updateEnrollment(tenantId, upd.enrollmentId, {
        registrationNo:       upd.registrationNo,
        registrationNoStatus: 'ASSIGNED',
      });
    }

    // Update batch record
    await AcademicsRepo.updateRegistrationBatch(tenantId, batch._id.toString(), {
      status:             'GENERATED',
      lastRegistrationNo: counter,
      generatedAt:        new Date(),
      generatedBy:        new Types.ObjectId(profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'REGISTRATION_NUMBERS_GENERATED',
      entityType: 'AcademicRegistrationBatch', entityId: batch._id.toString(),
      after: { academicYearId: input.academicYearId, campusId: input.campusId, gradeId: input.gradeId, count: counter },
    });

    return { generated: counter, updates };
  }
}
