import { AuthContext } from '@vebgenix/auth';
import { AcademicsRepo, Student, StudentAcademicEnrollment } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { formatNumberPadded } from '../academic-numbering';

// ── AssignStudentToSection (inlined) ──────────────────────────────────────────

async function assignStudentToSection(ctx: AuthContext, input: {
  studentId: string;
  academicYearId: string;
  campusId: string;
  gradeId: string;
  sectionId: string;
  programId?: string;
  joiningDate?: string;
  joiningType?: 'FRESH' | 'LATERAL' | 'TRANSFER' | 'RE_ADMISSION';
}) {
  authorize(ctx, 'academics.enrollment.create');
  const tenantId = getTenantId(ctx);
  const profileId = ctx.membership!.profileId;

  const existing = await AcademicsRepo.findEnrollment(tenantId, input.studentId, input.academicYearId);
  if (existing) {
    throw new AppError(
      'CONFLICT',
      'Student already has an active enrollment for this academic year. Use transferStudentSection to move them.',
    );
  }

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

// ── TransferStudentSection (inlined) ─────────────────────────────────────────

async function transferStudentSection(ctx: AuthContext, input: {
  studentId: string;
  academicYearId: string;
  campusId: string;
  gradeId: string;
  newSectionId: string;
  reason?: string;
}) {
  authorize(ctx, 'academics.enrollment.transfer');
  const tenantId = getTenantId(ctx);
  const profileId = ctx.membership!.profileId;

  const current = await AcademicsRepo.findEnrollment(tenantId, input.studentId, input.academicYearId);
  if (!current || current.status !== 'ACTIVE') {
    throw new AppError('NOT_FOUND', 'No active enrollment found for this student in this academic year');
  }

  if (current.sectionId?.toString() === input.newSectionId) {
    throw new AppError('BAD_REQUEST', 'Student is already in the target section');
  }

  await AcademicsRepo.updateEnrollment(tenantId, current._id.toString(), { status: 'TRANSFERRED' });

  const rollNoBatch = await AcademicsRepo.findOrCreateRollNoBatch(
    tenantId, input.academicYearId, input.campusId, input.gradeId, input.newSectionId,
  );

  let rollNo: string | undefined;
  let rollNoStatus: 'PENDING' | 'ASSIGNED' = 'PENDING';

  if (rollNoBatch.status === 'FROZEN' || rollNoBatch.status === 'GENERATED') {
    const nextRollNo = rollNoBatch.lastRollNo + 1;
    rollNo = formatNumberPadded(nextRollNo, 3);
    rollNoStatus = 'ASSIGNED';
    await AcademicsRepo.updateRollNoBatch(tenantId, rollNoBatch._id.toString(), { lastRollNo: nextRollNo });
  }

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

// ── GenerateRegistrationNumbers (inlined) ─────────────────────────────────────

async function generateRegistrationNumbers(ctx: AuthContext, input: {
  academicYearId: string;
  campusId: string;
  gradeId: string;
}) {
  authorize(ctx, 'academics.registration.generate');
  const tenantId = getTenantId(ctx);
  const profileId = ctx.membership!.profileId;

  const batch = await AcademicsRepo.findOrCreateRegistrationBatch(
    tenantId, input.academicYearId, input.campusId, input.gradeId,
  );

  if (batch.status === 'FROZEN') {
    throw new AppError('CONFLICT', 'Registration numbers are frozen for this grade and cannot be regenerated');
  }

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

  const studentIds = enrollments.map(e => e.studentId);
  const students = await Student.find({ tenantId, _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

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

  for (const upd of updates) {
    await AcademicsRepo.updateEnrollment(tenantId, upd.enrollmentId, {
      registrationNo:       upd.registrationNo,
      registrationNoStatus: 'ASSIGNED',
    });
  }

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

// ── FreezeRegistrationNumbers (inlined) ──────────────────────────────────────

async function freezeRegistrationNumbers(ctx: AuthContext, input: {
  academicYearId: string;
  campusId: string;
  gradeId: string;
}) {
  authorize(ctx, 'academics.registration.freeze');
  const tenantId = getTenantId(ctx);
  const profileId = ctx.membership!.profileId;

  const batch = await AcademicsRepo.findOrCreateRegistrationBatch(
    tenantId, input.academicYearId, input.campusId, input.gradeId,
  );

  if (batch.status === 'FROZEN') throw new AppError('CONFLICT', 'Registration numbers are already frozen');
  if (batch.status !== 'GENERATED') throw new AppError('BAD_REQUEST', 'Registration numbers must be generated before freezing');

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

// ── GenerateRollNumbers (inlined) ─────────────────────────────────────────────

async function generateRollNumbers(ctx: AuthContext, input: {
  academicYearId: string;
  campusId: string;
  gradeId: string;
  sectionId: string;
  generationMode?: 'ALPHABETICAL' | 'SEQUENTIAL';
}) {
  authorize(ctx, 'academics.rollno.generate');
  const tenantId = getTenantId(ctx);
  const profileId = ctx.membership!.profileId;
  const mode = input.generationMode ?? 'ALPHABETICAL';

  const batch = await AcademicsRepo.findOrCreateRollNoBatch(
    tenantId, input.academicYearId, input.campusId, input.gradeId, input.sectionId,
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

// ── FreezeRollNumbers (inlined) ───────────────────────────────────────────────

async function freezeRollNumbers(ctx: AuthContext, input: {
  academicYearId: string;
  campusId: string;
  gradeId: string;
  sectionId: string;
}) {
  authorize(ctx, 'academics.rollno.freeze');
  const tenantId = getTenantId(ctx);
  const profileId = ctx.membership!.profileId;

  const batch = await AcademicsRepo.findOrCreateRollNoBatch(
    tenantId, input.academicYearId, input.campusId, input.gradeId, input.sectionId,
  );

  if (batch.status === 'FROZEN') throw new AppError('CONFLICT', 'Roll numbers are already frozen');
  if (batch.status !== 'GENERATED') throw new AppError('BAD_REQUEST', 'Roll numbers must be generated before freezing');

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

// ── handleAcademicNumbers ─────────────────────────────────────────────────────

export async function handleAcademicNumbers(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    // ── Enrollment ──────────────────────────────────────────────────────────────

    case 'assignStudentToSection':
    case 'POST:/api/admin/academics/enrollments': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof assignStudentToSection>[1];
      return assignStudentToSection(ctx, input);
    }

    case 'transferStudentSection':
    case 'POST:/api/admin/academics/enrollments/transfer': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof transferStudentSection>[1];
      return transferStudentSection(ctx, input);
    }

    case 'listEnrollments':
    case 'GET:/api/admin/academics/enrollments': {
      authorize(ctx, 'academics.enrollment.read');
      const filters: Record<string, unknown> = {};
      if (args.academicYearId) filters.academicYearId = args.academicYearId;
      if (args.campusId)       filters.campusId       = args.campusId;
      if (args.gradeId)        filters.gradeId        = args.gradeId;
      if (args.sectionId)      filters.sectionId      = args.sectionId;
      if (args.status)         filters.status         = args.status;
      return AcademicsRepo.listEnrollments(tenantId, filters);
    }

    // ── Registration Numbers ────────────────────────────────────────────────────

    case 'generateRegistrationNumbers':
    case 'POST:/api/admin/academics/registration-numbers/generate': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof generateRegistrationNumbers>[1];
      return generateRegistrationNumbers(ctx, input);
    }

    case 'freezeRegistrationNumbers':
    case 'POST:/api/admin/academics/registration-numbers/freeze': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof freezeRegistrationNumbers>[1];
      return freezeRegistrationNumbers(ctx, input);
    }

    case 'listRegistrationBatches':
    case 'GET:/api/admin/academics/registration-batches': {
      authorize(ctx, 'academics.registration.read');
      const filters: Record<string, unknown> = {};
      if (args.academicYearId) filters.academicYearId = args.academicYearId;
      if (args.campusId)       filters.campusId       = args.campusId;
      if (args.gradeId)        filters.gradeId        = args.gradeId;
      return AcademicsRepo.listRegistrationBatches(tenantId, filters);
    }

    // ── Roll Numbers ────────────────────────────────────────────────────────────

    case 'generateRollNumbers':
    case 'POST:/api/admin/academics/roll-numbers/generate': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof generateRollNumbers>[1];
      return generateRollNumbers(ctx, input);
    }

    case 'freezeRollNumbers':
    case 'POST:/api/admin/academics/roll-numbers/freeze': {
      const input = ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof freezeRollNumbers>[1];
      return freezeRollNumbers(ctx, input);
    }

    case 'listRollNoBatches':
    case 'GET:/api/admin/academics/roll-number-batches': {
      authorize(ctx, 'academics.rollno.read');
      const filters: Record<string, unknown> = {};
      if (args.academicYearId) filters.academicYearId = args.academicYearId;
      if (args.campusId)       filters.campusId       = args.campusId;
      if (args.gradeId)        filters.gradeId        = args.gradeId;
      if (args.sectionId)      filters.sectionId      = args.sectionId;
      return AcademicsRepo.listRollNoBatches(tenantId, filters);
    }

    default:
      return undefined;
  }
}
