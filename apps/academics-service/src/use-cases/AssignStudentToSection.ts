import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { formatNumberPadded } from '../academicNumbering';

export interface AssignStudentToSectionInput {
  studentId: string;
  academicYearId: string;
  campusId: string;
  gradeId: string;
  sectionId: string;
  programId?: string;
  joiningDate?: string;
  joiningType?: 'FRESH' | 'LATERAL' | 'TRANSFER' | 'RE_ADMISSION';
}

export class AssignStudentToSection {
  static async execute(ctx: AuthContext, input: AssignStudentToSectionInput) {
    authorize(ctx, 'academics.enrollment.create');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    // Check for existing active enrollment this year (findEnrollment already filters ACTIVE)
    const existing = await AcademicsRepo.findEnrollment(tenantId, input.studentId, input.academicYearId);
    if (existing) {
      throw new AppError(
        'CONFLICT',
        'Student already has an active enrollment for this academic year. Use transferStudentSection to move them.',
      );
    }

    // ── Registration No: append if grade batch is already FROZEN ─────────────
    const regBatch = await AcademicsRepo.findOrCreateRegistrationBatch(
      tenantId, input.academicYearId, input.campusId, input.gradeId,
    );

    let registrationNo: string | undefined;
    let registrationNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';

    if (regBatch.status === 'FROZEN') {
      const nextRegNo = regBatch.lastRegistrationNo + 1;
      registrationNo = formatNumberPadded(nextRegNo, 3);
      registrationNoStatus = 'ASSIGNED';
      await AcademicsRepo.updateRegistrationBatch(tenantId, regBatch._id.toString(), { lastRegistrationNo: nextRegNo });
    }

    // ── Roll No: append if section batch is already FROZEN ───────────────────
    const rollNoBatch = await AcademicsRepo.findOrCreateRollNoBatch(
      tenantId, input.academicYearId, input.campusId, input.gradeId, input.sectionId,
    );

    let rollNo: string | undefined;
    let rollNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';

    if (rollNoBatch.status === 'FROZEN') {
      const nextRollNo = rollNoBatch.lastRollNo + 1;
      rollNo = formatNumberPadded(nextRollNo, 3);
      rollNoStatus = 'ASSIGNED';
      await AcademicsRepo.updateRollNoBatch(tenantId, rollNoBatch._id.toString(), { lastRollNo: nextRollNo });
    }

    const enrollment = await AcademicsRepo.createEnrollment(tenantId, {
      studentId:            new Types.ObjectId(input.studentId),
      academicYearId:       new Types.ObjectId(input.academicYearId),
      campusId:             new Types.ObjectId(input.campusId),
      gradeId:              new Types.ObjectId(input.gradeId),
      sectionId:            new Types.ObjectId(input.sectionId),
      programId:            input.programId ? new Types.ObjectId(input.programId) : undefined,
      joiningDate:          input.joiningDate ? new Date(input.joiningDate) : new Date(),
      joiningType:          input.joiningType ?? 'FRESH',
      registrationNo,
      registrationNoStatus,
      rollNo,
      rollNoStatus,
      status:               'ACTIVE',
      createdBy:            new Types.ObjectId(profileId),
    });

    // Keep Student master in sync
    await AcademicsRepo.updateStudent(tenantId, input.studentId, {
      classId:   new Types.ObjectId(input.gradeId),
      sectionId: new Types.ObjectId(input.sectionId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'STUDENT_ASSIGNED_TO_SECTION',
      entityType: 'StudentAcademicEnrollment', entityId: enrollment._id.toString(),
      after: { studentId: input.studentId, gradeId: input.gradeId, sectionId: input.sectionId, rollNo },
    });

    return enrollment;
  }
}
