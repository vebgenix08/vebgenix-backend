import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo, AdmissionsRepo, Student } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { generateAdmissionNo, formatNumberPadded } from '../academicNumbering';

export interface EnrollStudentInput {
  applicationId?:  string;
  campusId:        string;
  academicYearId:  string;
  programId?:      string;
  classId?:        string;
  sectionId?:      string;
  firstName:       string;
  lastName?:       string;
  phone?:          string;
  email?:          string;
  dateOfBirth?:    string;
  gender?:         string;
  address?:        string;
  guardians?:      Array<{ name: string; relation: string; phone: string; email?: string }>;
  /** Admin override — bypasses duplicate hard-block */
  force?:          boolean;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class EnrollStudent {
  static async execute(ctx: AuthContext, input: EnrollStudentInput) {
    authorize(ctx, 'students.enroll');
    const tenantId    = getTenantId(ctx);
    const forceEnroll = input.force === true;
    const fullName    = [input.firstName, input.lastName].filter(Boolean).join(' ');
    // ── Duplicate detection — hard-block unless force=true ────────────────────
    if (!forceEnroll) {
      const duplicates: Array<Record<string, unknown>> = [];

      if (input.phone) {
        const byPhone = await Student.find({ tenantId, phone: input.phone, status: { $ne: 'INACTIVE' } }).lean();
        byPhone.forEach((s) => duplicates.push({
          type: 'student', match: 'phone',
          id: s._id, name: s.fullName,
          registrationNumber: s.registrationNumber,
        }));
      }

      if (input.email) {
        const byEmail = await Student.find({ tenantId, email: input.email, status: { $ne: 'INACTIVE' } }).lean();
        byEmail.forEach((s) => {
          if (!duplicates.some((d) => d.id?.toString() === s._id.toString())) {
            duplicates.push({ type: 'student', match: 'email', id: s._id, name: s.fullName, registrationNumber: s.registrationNumber });
          }
        });
      }

      // Hard identity match: first/last name + DOB, with fullName fallback for older records.
      if (input.firstName && input.dateOfBirth) {
        const nameConditions: Record<string, unknown>[] = [
          {
            firstName: new RegExp(`^${escapeRegex(input.firstName)}$`, 'i'),
            ...(input.lastName ? { lastName: new RegExp(`^${escapeRegex(input.lastName)}$`, 'i') } : {}),
          },
          { fullName: new RegExp(`^${escapeRegex(fullName || input.firstName)}$`, 'i') },
        ];
        const byIdentity = await Student.find({
          tenantId,
          $or:         nameConditions,
          dateOfBirth: new Date(input.dateOfBirth),
          status:      { $ne: 'INACTIVE' },
        }).lean();
        byIdentity.forEach((s) => {
          if (!duplicates.some((d) => d.id?.toString() === s._id.toString())) {
            duplicates.push({ type: 'student', match: 'name+dob', id: s._id, name: s.fullName, registrationNumber: s.registrationNumber });
          }
        });
      }

      if (duplicates.length > 0) {
        // Throw 409 CONFLICT with duplicate details so the UI can show the user
        throw Object.assign(
          new AppError('CONFLICT', `Possible duplicate student detected (${duplicates.length} match). Use force=true to override.`),
          { duplicates }
        );
      }
    }

    // ── Create student record ────────────────────────────────────────────────
    const linkedApplication = input.applicationId
      ? await AdmissionsRepo.findApplicationById(tenantId, input.applicationId)
      : null;
    const admissionNo = await generateAdmissionNo(tenantId, input.academicYearId);

    const student = await AcademicsRepo.createStudent(tenantId, {
      campusId:            new Types.ObjectId(input.campusId),
      academicYearId:      new Types.ObjectId(input.academicYearId),
      applicationId:       input.applicationId ? new Types.ObjectId(input.applicationId) : undefined,
      programId:           input.programId     ? new Types.ObjectId(input.programId)     : undefined,
      classId:             input.classId       ? new Types.ObjectId(input.classId)       : undefined,
      sectionId:           input.sectionId     ? new Types.ObjectId(input.sectionId)     : undefined,
      // registrationNumber is the legacy unique field; value matches admissionNo (same permanent ID)
      registrationNumber:  admissionNo,
      admissionNo,
      applicationNo:       linkedApplication?.applicationNumber,
      admissionStatus:     'ENROLLED',
      admissionConfirmedAt: new Date(),
      admissionConfirmedBy: new Types.ObjectId(ctx.membership!.profileId),
      firstName:          input.firstName,
      lastName:           input.lastName,
      fullName,
      phone:              input.phone,
      email:              input.email,
      dateOfBirth:        input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      gender:             input.gender,
      address:            input.address,
      status:             'ACTIVE',
      guardians:          input.guardians ?? [],
    });

    // ── Create academic enrollment when class is provided ────────────────────
    if (input.classId) {
      const rollNoBatch = input.sectionId
        ? await AcademicsRepo.findOrCreateRollNoBatch(
            tenantId, input.academicYearId, input.campusId, input.classId, input.sectionId,
          )
        : null;

      let rollNo: string | undefined;
      let rollNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';

      if (rollNoBatch && (rollNoBatch.status === 'FROZEN' || rollNoBatch.status === 'GENERATED')) {
        const nextRollNo = rollNoBatch.lastRollNo + 1;
        rollNo = formatNumberPadded(nextRollNo, 3);
        rollNoStatus = 'ASSIGNED';
        await AcademicsRepo.updateRollNoBatch(tenantId, rollNoBatch._id.toString(), { lastRollNo: nextRollNo });
      }

      const regBatch = await AcademicsRepo.findOrCreateRegistrationBatch(
        tenantId, input.academicYearId, input.campusId, input.classId,
      );

      let registrationNo: string | undefined;
      let registrationNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';

      if (regBatch.status === 'FROZEN') {
        const nextRegNo = regBatch.lastRegistrationNo + 1;
        registrationNo = formatNumberPadded(nextRegNo, 3);
        registrationNoStatus = 'ASSIGNED';
        await AcademicsRepo.updateRegistrationBatch(tenantId, regBatch._id.toString(), { lastRegistrationNo: nextRegNo });
      }

      await AcademicsRepo.createEnrollment(tenantId, {
        studentId:            new Types.ObjectId(student._id.toString()),
        academicYearId:       new Types.ObjectId(input.academicYearId),
        campusId:             new Types.ObjectId(input.campusId),
        gradeId:              new Types.ObjectId(input.classId),
        sectionId:            input.sectionId ? new Types.ObjectId(input.sectionId) : undefined,
        programId:            input.programId ? new Types.ObjectId(input.programId) : undefined,
        joiningDate:          new Date(),
        joiningType:          'FRESH',
        registrationNo,
        registrationNoStatus,
        rollNo,
        rollNoStatus,
        status:               'ACTIVE',
        createdBy:            new Types.ObjectId(ctx.membership!.profileId),
      });
    }

    // ── Mark linked application ENROLLED ─────────────────────────────────────
    if (input.applicationId) {
      await AdmissionsRepo.updateApplication(tenantId, input.applicationId, { status: 'ENROLLED' });

      // ── Mark source enquiry CONVERTED (non-fatal) ─────────────────────────
      try {
        const app = linkedApplication ?? await AdmissionsRepo.findApplicationById(tenantId, input.applicationId);
        const enquiryId = (app as unknown as Record<string, unknown>)?.enquiryId;
        if (enquiryId) {
          await AdmissionsRepo.updateEnquiry(tenantId, enquiryId.toString(), { status: 'CONVERTED' });
        }
      } catch {
        console.warn('[EnrollStudent] Could not mark enquiry as CONVERTED — non-fatal');
      }
    }

    await AuditLogger.logTenantAction({
      ctx, action: 'STUDENT_ENROLLED',
      entityType: 'Student', entityId: student._id.toString(), entityName: fullName,
      after: { registrationNumber: student.registrationNumber, campusId: input.campusId },
    });

    return student;
  }
}
