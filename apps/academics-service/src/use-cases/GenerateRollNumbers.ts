import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo, Student, StudentAcademicEnrollment } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { formatNumberPadded } from '../academicNumbering';

export interface GenerateRollNumbersInput {
  academicYearId: string;
  campusId: string;
  gradeId: string;
  sectionId: string;
  generationMode?: 'ALPHABETICAL' | 'SEQUENTIAL';
}

export class GenerateRollNumbers {
  static async execute(ctx: AuthContext, input: GenerateRollNumbersInput) {
    authorize(ctx, 'academics.rollno.generate');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;
    const mode = input.generationMode ?? 'ALPHABETICAL';

    const batch = await AcademicsRepo.findOrCreateRollNoBatch(
      tenantId,
      input.academicYearId,
      input.campusId,
      input.gradeId,
      input.sectionId,
    );

    if (batch.status === 'FROZEN') {
      throw new AppError('CONFLICT', 'Roll numbers are frozen for this section and cannot be regenerated');
    }

    const enrollments = await StudentAcademicEnrollment.find({
      tenantId,
      academicYearId: new Types.ObjectId(input.academicYearId),
      campusId:       new Types.ObjectId(input.campusId),
      gradeId:        new Types.ObjectId(input.gradeId),
      sectionId:      new Types.ObjectId(input.sectionId),
      status:         'ACTIVE',
    }).lean();

    if (enrollments.length === 0) {
      throw new AppError('BAD_REQUEST', 'No active enrollments found for this section');
    }

    let sorted = [...enrollments];

    if (mode === 'ALPHABETICAL') {
      const studentIds = enrollments.map(e => e.studentId);
      const students = await Student.find({ tenantId, _id: { $in: studentIds } }).lean();
      const studentMap = new Map(students.map(s => [s._id.toString(), s]));
      sorted.sort((a, b) => {
        const sa = studentMap.get(a.studentId.toString())?.fullName ?? '';
        const sb = studentMap.get(b.studentId.toString())?.fullName ?? '';
        return sa.localeCompare(sb);
      });
    } else {
      // SEQUENTIAL — sort by createdAt (join order)
      sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    let counter = 0;
    const updates: Array<{ enrollmentId: string; rollNo: string }> = [];

    for (const enrollment of sorted) {
      counter++;
      const rollNo = formatNumberPadded(counter, 3);
      updates.push({ enrollmentId: enrollment._id.toString(), rollNo });
    }

    for (const upd of updates) {
      await AcademicsRepo.updateEnrollment(tenantId, upd.enrollmentId, {
        rollNo:       upd.rollNo,
        rollNoStatus: 'ASSIGNED',
      });
    }

    await AcademicsRepo.updateRollNoBatch(tenantId, batch._id.toString(), {
      status:         'GENERATED',
      generationMode: mode,
      lastRollNo:     counter,
      generatedAt:    new Date(),
      generatedBy:    new Types.ObjectId(profileId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'ROLL_NUMBERS_GENERATED',
      entityType: 'AcademicRollNoBatch', entityId: batch._id.toString(),
      after: { academicYearId: input.academicYearId, sectionId: input.sectionId, count: counter, mode },
    });

    return { generated: counter, updates };
  }
}
