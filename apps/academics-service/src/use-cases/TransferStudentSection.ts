import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { formatNumberPadded } from '../academicNumbering';

export interface TransferStudentSectionInput {
  studentId: string;
  academicYearId: string;
  campusId: string;
  gradeId: string;
  newSectionId: string;
  reason?: string;
}

export class TransferStudentSection {
  static async execute(ctx: AuthContext, input: TransferStudentSectionInput) {
    authorize(ctx, 'academics.enrollment.transfer');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    // Find the current active enrollment
    const current = await AcademicsRepo.findEnrollment(tenantId, input.studentId, input.academicYearId);
    if (!current || current.status !== 'ACTIVE') {
      throw new AppError('NOT_FOUND', 'No active enrollment found for this student in this academic year');
    }

    if (current.sectionId?.toString() === input.newSectionId) {
      throw new AppError('BAD_REQUEST', 'Student is already in the target section');
    }

    // Mark old enrollment as TRANSFERRED
    await AcademicsRepo.updateEnrollment(tenantId, current._id.toString(), {
      status: 'TRANSFERRED',
    });

    // Determine roll number in new section
    const rollNoBatch = await AcademicsRepo.findOrCreateRollNoBatch(
      tenantId, input.academicYearId, input.campusId, input.gradeId, input.newSectionId,
    );

    let rollNo: string | undefined;
    let rollNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';

    if (rollNoBatch.status === 'FROZEN' || rollNoBatch.status === 'GENERATED') {
      const nextRollNo = rollNoBatch.lastRollNo + 1;
      rollNo = formatNumberPadded(nextRollNo, 3);
      rollNoStatus = 'ASSIGNED';
      await AcademicsRepo.updateRollNoBatch(tenantId, rollNoBatch._id.toString(), {
        lastRollNo: nextRollNo,
      });
    }

    // Create new enrollment in the target section
    const newEnrollment = await AcademicsRepo.createEnrollment(tenantId, {
      studentId:            new Types.ObjectId(input.studentId),
      academicYearId:       new Types.ObjectId(input.academicYearId),
      campusId:             new Types.ObjectId(input.campusId),
      gradeId:              new Types.ObjectId(input.gradeId),
      sectionId:            new Types.ObjectId(input.newSectionId),
      programId:            current.programId,
      joiningDate:          new Date(),
      joiningType:          'TRANSFER',
      registrationNo:       current.registrationNo,
      registrationNoStatus: current.registrationNoStatus,
      rollNo,
      rollNoStatus,
      status:               'ACTIVE',
      createdBy:            new Types.ObjectId(profileId),
    });

    // Update Student master
    await AcademicsRepo.updateStudent(tenantId, input.studentId, {
      sectionId: new Types.ObjectId(input.newSectionId),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'STUDENT_SECTION_TRANSFERRED',
      entityType: 'StudentAcademicEnrollment', entityId: newEnrollment._id.toString(),
      after: {
        studentId:    input.studentId,
        fromSection:  current.sectionId?.toString(),
        toSection:    input.newSectionId,
        rollNo,
      },
    });

    return { previous: current, current: newEnrollment };
  }
}
