import { AcademicsRepo, AdmissionsRepo, FinanceRepo, Student } from '@vebgenix/db';
import { Types } from 'mongoose';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { generateAdmissionNo, formatNumberPadded } from '../academic-numbering';

// ── EnrollStudent use-case (inlined) ─────────────────────────────────────────

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface EnrollStudentInput {
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
  force?:          boolean;
}

async function enrollStudent(ctx: AuthContext, input: EnrollStudentInput) {
  authorize(ctx, 'students.enroll');
  const tenantId    = getTenantId(ctx);
  const forceEnroll = input.force === true;
  const fullName    = [input.firstName, input.lastName].filter(Boolean).join(' ');

  if (!forceEnroll) {
    const duplicates: Array<Record<string, unknown>> = [];
    const exactDob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
    if (exactDob && !Number.isNaN(exactDob.getTime())) {
      exactDob.setUTCHours(0, 0, 0, 0);
    }

    if (input.phone && fullName && exactDob && !Number.isNaN(exactDob.getTime())) {
      const exactMatch = await Student.findOne({
        tenantId,
        phone: input.phone,
        dateOfBirth: exactDob,
        $or: [
          {
            firstName: new RegExp(`^${escapeRegex(input.firstName)}$`, 'i'),
            ...(input.lastName ? { lastName: new RegExp(`^${escapeRegex(input.lastName)}$`, 'i') } : {}),
          },
          { fullName: new RegExp(`^${escapeRegex(fullName)}$`, 'i') },
        ],
        status:      { $ne: 'INACTIVE' },
      }).lean();
      if (exactMatch) {
        duplicates.push({
          type: 'student',
          match: 'name+dob+phone',
          id: exactMatch._id,
          name: exactMatch.fullName,
          registrationNumber: exactMatch.registrationNumber,
        });
      }
    } else {
      if (input.phone) {
        const byPhone = await Student.findOne({ tenantId, phone: input.phone, status: { $ne: 'INACTIVE' } }).lean();
        if (byPhone) {
          duplicates.push({
            type: 'student',
            match: 'phone',
            id: byPhone._id,
            name: byPhone.fullName,
            registrationNumber: byPhone.registrationNumber,
          });
        }
      }

      if (input.firstName && exactDob && !Number.isNaN(exactDob.getTime())) {
        const byIdentity = await Student.findOne({
          tenantId,
          $or: [
            {
              firstName: new RegExp(`^${escapeRegex(input.firstName)}$`, 'i'),
              ...(input.lastName ? { lastName: new RegExp(`^${escapeRegex(input.lastName)}$`, 'i') } : {}),
            },
            { fullName: new RegExp(`^${escapeRegex(fullName || input.firstName)}$`, 'i') },
          ],
          dateOfBirth: exactDob,
          status: { $ne: 'INACTIVE' },
        }).lean();
        if (byIdentity && !duplicates.some((d) => d.id?.toString() === byIdentity._id.toString())) {
          duplicates.push({
            type: 'student',
            match: 'name+dob',
            id: byIdentity._id,
            name: byIdentity.fullName,
            registrationNumber: byIdentity.registrationNumber,
          });
        }
      }
    }

    if (input.email) {
      const byEmail = await Student.findOne({ tenantId, email: input.email, status: { $ne: 'INACTIVE' } }).lean();
      if (byEmail && !duplicates.some((d) => d.id?.toString() === byEmail._id.toString())) {
        duplicates.push({
          type: 'student',
          match: 'email',
          id: byEmail._id,
          name: byEmail.fullName,
          registrationNumber: byEmail.registrationNumber,
        });
      }
    }

    if (duplicates.length > 0) {
      throw Object.assign(
        new AppError('CONFLICT', `Possible duplicate student detected (${duplicates.length} match). Use force=true to override.`),
        { duplicates }
      );
    }
  }

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

  if (input.applicationId) {
    await AdmissionsRepo.updateApplication(tenantId, input.applicationId, { status: 'ENROLLED' });
    try {
      const app = linkedApplication ?? await AdmissionsRepo.findApplicationById(tenantId, input.applicationId);
      const enquiryId = (app as unknown as Record<string, unknown>)?.enquiryId;
      if (enquiryId) {
        await AdmissionsRepo.updateEnquiry(tenantId, enquiryId.toString(), { status: 'CONVERTED' });
      }
    } catch {
      console.warn('[enrollStudent] Could not mark enquiry as CONVERTED — non-fatal');
    }
  }

  await AuditLogger.logTenantAction({
    ctx, action: 'STUDENT_ENROLLED',
    entityType: 'Student', entityId: student._id.toString(), entityName: fullName,
    after: { registrationNumber: student.registrationNumber, campusId: input.campusId },
  });

  // TC-021: Auto-generate fee orders if class already has an active fee mapping
  if (input.classId) {
    try {
      await FinanceRepo.autoGenerateFeeOrdersForStudent({
        tenantId,
        studentId:     student._id.toString(),
        classId:       input.classId,
        sectionId:     input.sectionId,
        academicYearId: input.academicYearId,
        campusId:      input.campusId,
      });
    } catch (err) {
      console.warn('[enrollStudent] Auto fee order generation failed (non-fatal):', err);
    }
  }

  return student;
}

// ── toGqlStudent helper ───────────────────────────────────────────────────────

function toGqlStudent(student: unknown) {
  if (!student) return student;
  const doc = (student as { toObject?: () => Record<string, unknown> }).toObject?.()
    ?? (student as Record<string, unknown>);
  const { _id, ...rest } = doc;
  return { ...rest, id: String(doc.id ?? _id) };
}

// ── handleStudents ────────────────────────────────────────────────────────────

export async function handleStudents(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudents':
    case 'GET:/api/admin/students': {
      const students = await AcademicsRepo.listStudents(tenantId, (args.filter ?? {}) as Record<string, unknown>);

      // Collect unique classId and sectionId values to batch-lookup names
      const { Class, Section } = await import('@vebgenix/db');
      const classIds   = [...new Set(students.map((s: unknown) => (s as Record<string,unknown>).classId?.toString()).filter(Boolean))] as string[];
      const sectionIds = [...new Set(students.map((s: unknown) => (s as Record<string,unknown>).sectionId?.toString()).filter(Boolean))] as string[];

      const [classDocs, sectionDocs] = await Promise.all([
        classIds.length   ? Class.find({ _id: { $in: classIds } }, 'name').lean()   : [],
        sectionIds.length ? Section.find({ _id: { $in: sectionIds } }, 'name displayName').lean() : [],
      ]);

      const classNameById   = new Map((classDocs   as Array<{ _id: { toString(): string }; name: string }>).map(c => [c._id.toString(), c.name]));
      const sectionNameById = new Map((sectionDocs as Array<{ _id: { toString(): string }; name: string; displayName?: string }>).map(s => [s._id.toString(), s.name]));

      return {
        items: students.map((s: unknown) => {
          const base = toGqlStudent(s) as Record<string, unknown>;
          return {
            ...base,
            className:   base.classId   ? (classNameById.get(base.classId.toString())   ?? null) : null,
            sectionName: base.sectionId ? (sectionNameById.get(base.sectionId.toString()) ?? null) : null,
          };
        }),
        nextToken: null,
      };
    }

    case 'getStudent':
    case 'GET:/api/admin/students/:studentId': {
      const student = await AcademicsRepo.findStudentById(tenantId, (args.studentId ?? args.id) as string);
      if (!student) return null;
      const base = toGqlStudent(student) as Record<string, unknown>;
      if (base.classId || base.sectionId) {
        const { Class, Section } = await import('@vebgenix/db');
        const [classDoc, sectionDoc] = await Promise.all([
          base.classId   ? Class.findById(base.classId, 'name').lean()                        : null,
          base.sectionId ? Section.findById(base.sectionId, 'name displayName').lean() : null,
        ]);
        return {
          ...base,
          className:   (classDoc   as Record<string,unknown> | null)?.name   ?? null,
          sectionName: (sectionDoc as Record<string,unknown> | null)?.name ?? null,
        };
      }
      return base;
    }

    case 'enrollStudent':
    case 'POST:/api/admin/students': {
      const student = await enrollStudent(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as EnrollStudentInput);
      return toGqlStudent(student);
    }

    case 'convertApplicationToStudent': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const applicationId = (input.applicationId ?? args.applicationId ?? args.id) as string | undefined;
      if (!applicationId) throw new AppError('BAD_REQUEST', 'applicationId is required');

      const application = await AdmissionsRepo.findApplicationById(tenantId, applicationId);
      if (!application) throw new AppError('NOT_FOUND', 'Application not found');
      if (application.status === 'ENROLLED') throw new AppError('CONFLICT', 'Application is already enrolled');
      if (application.status !== 'APPROVED') {
        throw new AppError('CONFLICT', `Application must be APPROVED before conversion. Current status is ${application.status}`);
      }

      const nameParts = application.studentName.trim().split(/\s+/).filter(Boolean);
      const firstName = nameParts.shift() ?? application.studentName;
      const lastName = nameParts.length > 0 ? nameParts.join(' ') : undefined;
      const guardians = application.guardianName && application.guardianPhone
        ? [{
            name: application.guardianName,
            relation: application.guardianRelation ?? 'Guardian',
            phone: application.guardianPhone,
          }]
        : undefined;

      const student = await enrollStudent(ctx, {
        applicationId,
        campusId:       application.campusId.toString(),
        academicYearId: application.academicYearId.toString(),
        programId:      application.programId?.toString(),
        firstName,
        lastName,
        phone:          application.phone,
        email:          application.email,
        dateOfBirth:    application.dateOfBirth?.toISOString(),
        gender:         application.gender,
        address:        application.address,
        guardians,
      });
      return toGqlStudent(student);
    }

    case 'updateStudent':
    case 'PATCH:/api/admin/students/:studentId': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const update: Record<string, unknown> = { ...input };
      if (update.firstName || update.lastName) {
        const existing = await AcademicsRepo.findStudentById(tenantId, (args.studentId ?? args.id) as string);
        const firstName = (update.firstName ?? existing?.firstName) as string | undefined;
        const lastName  = (update.lastName  ?? existing?.lastName)  as string | undefined;
        if (firstName) update.fullName = [firstName, lastName].filter(Boolean).join(' ');
      }
      return toGqlStudent(await AcademicsRepo.updateStudent(tenantId, (args.studentId ?? args.id) as string, update));
    }

    case 'updateStudentStatus':
    case 'PATCH:/api/admin/students/:studentId/status':
      authorize(ctx, 'students.status.update');
      return toGqlStudent(await AcademicsRepo.updateStudent(
        tenantId,
        (args.studentId ?? args.id) as string,
        { status: args.status as never },
      ));

    case 'assignStudentClass':
    case 'PATCH:/api/tenant/students/:studentId/assign-class':
      authorize(ctx, 'academics.students.assign');
      {
        const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
        const update: Record<string, unknown> = {
          classId: new Types.ObjectId(input.classId as string),
        };
        if (input.sectionId) update.sectionId = new Types.ObjectId(input.sectionId as string);
        return AcademicsRepo.updateStudent(
          tenantId,
          (args.studentId ?? args.id) as string,
          update,
        );
      }

    case 'bulkAssignStudentsToClass':
    case 'POST:/api/tenant/students/bulk-assign-class': {
      authorize(ctx, 'academics.students.assign');
      const { classId, sectionId, studentIds } = args as {
        classId: string; sectionId?: string; studentIds: string[];
      };
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new AppError('BAD_REQUEST', 'studentIds must be a non-empty array');
      }
      const update: Record<string, unknown> = { classId: new Types.ObjectId(classId) };
      if (sectionId) update.sectionId = new Types.ObjectId(sectionId);
      const result = await Student.updateMany(
        { tenantId, _id: { $in: studentIds.map(id => new Types.ObjectId(id)) } },
        { $set: update },
      );
      return { updatedCount: result.modifiedCount, classId };
    }

    case 'randomAssignStudentsToClass':
    case 'POST:/api/tenant/students/random-assign-class': {
      authorize(ctx, 'academics.students.assign');
      const { classIds, academicYearId } = args as { classIds: string[]; academicYearId: string };
      if (!Array.isArray(classIds) || classIds.length === 0) {
        throw new AppError('BAD_REQUEST', 'classIds required');
      }
      const filter: Record<string, unknown> = { tenantId, status: 'ACTIVE', classId: { $exists: false } };
      if (args.campusId) filter.campusId = new Types.ObjectId(args.campusId as string);
      const students = await Student.find(filter).lean();
      if (students.length === 0) return { assignedCount: 0 };
      const bulkOps = students.map((s, i) => ({
        updateOne: {
          filter: { _id: s._id },
          update: {
            $set: {
              classId:       new Types.ObjectId(classIds[i % classIds.length]),
              academicYearId: new Types.ObjectId(academicYearId),
            },
          },
        },
      }));
      const r = await Student.bulkWrite(bulkOps);
      return { assignedCount: r.modifiedCount };
    }

    case 'listSectionStudents':
    case 'GET:/api/tenant/sections/:sectionId/students':
      return Student.find({ tenantId, sectionId: new Types.ObjectId(args.sectionId as string), status: 'ACTIVE' })
        .sort({ fullName: 1 })
        .lean();

    case 'enableStudentPortal':
    case 'enablePortalAccess':
    case 'POST:/api/admin/students/:studentId/enable-portal': {
      authorize(ctx, 'students.portal.manage');
      const studentId = (args.studentId ?? args.id) as string;
      const student   = await AcademicsRepo.findStudentById(tenantId, studentId);
      if (!student) throw new AppError('NOT_FOUND', 'Student not found');
      const s     = student as unknown as Record<string, unknown>;
      const email = s.email as string | undefined;
      if (!email) throw new AppError('BAD_REQUEST', 'Student has no email address — add email first');
      const {
        AdminCreateUserCommand,
        AdminAddUserToGroupCommand,
        CognitoIdentityProviderClient,
      } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId:             process.env.COGNITO_USER_POOL_ID,
        Username:               email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email',            Value: email },
          { Name: 'name',             Value: s.fullName as string },
          { Name: 'custom:tenantId',  Value: tenantId },
          { Name: 'custom:role',      Value: 'STUDENT' },
          { Name: 'custom:studentId', Value: studentId },
          { Name: 'email_verified',   Value: 'true' },
        ],
      }));
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username:   email,
        GroupName:  'STUDENT',
      }));
      await AcademicsRepo.updateStudent(tenantId, studentId, { portalEnabled: true } as never);
      return { success: true, message: `Portal access enabled. Login credentials sent to ${email}` };
    }

    case 'enableGuardianPortal':
    case 'POST:/api/admin/students/:studentId/enable-guardian-portal': {
      authorize(ctx, 'students.portal.manage');
      const input = (args.input ?? args) as Record<string, unknown>;
      const studentId    = (input.studentId ?? args.studentId ?? args.id) as string;
      const guardianName = input.guardianName as string;
      const email        = input.email        as string;
      const phone        = input.phone        as string | undefined;
      const relationship = input.relationship as string | undefined;

      if (!studentId)    throw new AppError('BAD_REQUEST', 'studentId is required');
      if (!guardianName) throw new AppError('BAD_REQUEST', 'guardianName is required');
      if (!email)        throw new AppError('BAD_REQUEST', 'email is required');

      const student = await AcademicsRepo.findStudentById(tenantId, studentId);
      if (!student) throw new AppError('NOT_FOUND', 'Student not found');

      const {
        AdminCreateUserCommand,
        AdminAddUserToGroupCommand,
        CognitoIdentityProviderClient,
      } = await import('@aws-sdk/client-cognito-identity-provider');
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });

      const userAttributes = [
        { Name: 'email',            Value: email },
        { Name: 'name',             Value: guardianName },
        { Name: 'custom:tenantId',  Value: tenantId },
        { Name: 'custom:role',      Value: 'GUARDIAN' },
        { Name: 'custom:studentId', Value: studentId },
        { Name: 'email_verified',   Value: 'true' },
      ];
      if (phone)        userAttributes.push({ Name: 'phone_number', Value: phone });
      if (relationship) userAttributes.push({ Name: 'custom:relationship', Value: relationship });

      await cognito.send(new AdminCreateUserCommand({
        UserPoolId:             process.env.COGNITO_USER_POOL_ID,
        Username:               email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes:         userAttributes,
      }));
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username:   email,
        GroupName:  'GUARDIAN',
      }));

      return { success: true, message: `Guardian portal enabled. Login credentials sent to ${email}` };
    }

    default:
      return undefined;
  }
}
