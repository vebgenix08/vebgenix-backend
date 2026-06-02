import { AdmissionsRepo, Application, Enquiry, Student } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import { toGql, exactNameRegex, matchedFields, normalizeDateOnly, studentNameConditions } from '../admissions-utils';

async function findDuplicateMatches(
  tenantId: string,
  input: { studentName: string; phone?: string; email?: string; dob?: string; campusId?: string },
) {
  const name = String(input.studentName ?? '').trim();
  if (!name) {
    return { isDuplicate: false, matches: [] as Array<Record<string, unknown>> };
  }

  const nameRegex = exactNameRegex(name);
  const dob = normalizeDateOnly(input.dob);
  const campusObjectId = input.campusId ? new Types.ObjectId(input.campusId) : undefined;

  const [enquiries, applications, students] = await Promise.all([
    Enquiry.find({
      tenantId,
      studentName: nameRegex,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(campusObjectId ? { campusId: campusObjectId } : {}),
    }).sort({ createdAt: -1 }).limit(5).lean(),
    Application.find({
      tenantId,
      studentName: nameRegex,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(dob ? { dateOfBirth: dob } : {}),
      status: { $nin: ['REJECTED', 'WITHDRAWN'] },
      ...(campusObjectId ? { campusId: campusObjectId } : {}),
    }).sort({ createdAt: -1 }).limit(5).lean(),
    Student.find({
      tenantId,
      $or: studentNameConditions(name),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(dob ? { dateOfBirth: dob } : {}),
      status: { $ne: 'INACTIVE' },
      ...(campusObjectId ? { campusId: campusObjectId } : {}),
    }).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const matches = [
    ...enquiries.map((enquiry) => ({
      id: enquiry._id.toString(),
      type: 'enquiry',
      studentName: enquiry.studentName,
      status: enquiry.status,
      phone: enquiry.phone,
      email: enquiry.email,
      academicYearId: enquiry.academicYearId?.toString?.() ?? null,
      programName: enquiry.programName ?? null,
      dateOfBirth: null,
      registrationNumber: null,
      applicationNumber: null,
      matchedFields: matchedFields(input, enquiry),
    })),
    ...applications.map((application) => ({
      id: application._id.toString(),
      type: 'application',
      studentName: application.studentName,
      status: application.status,
      phone: application.phone,
      email: application.email,
      academicYearId: application.academicYearId?.toString?.() ?? null,
      programName: application.programId?.toString?.() ?? null,
      dateOfBirth: application.dateOfBirth ? new Date(application.dateOfBirth).toISOString() : null,
      registrationNumber: null,
      applicationNumber: application.applicationNumber ?? null,
      matchedFields: matchedFields(input, application),
    })),
    ...students.map((student) => ({
      id: student._id.toString(),
      type: 'student',
      studentName: student.fullName,
      status: student.status,
      phone: student.phone,
      email: student.email,
      academicYearId: student.academicYearId?.toString?.() ?? null,
      programName: student.programId?.toString?.() ?? null,
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString() : null,
      registrationNumber: student.registrationNumber ?? null,
      applicationNumber: student.applicationNo ?? null,
      matchedFields: matchedFields(input, student),
    })),
  ]
    .filter((match) => match.matchedFields.length > 0)
    .sort((left, right) => right.matchedFields.length - left.matchedFields.length);

  return {
    isDuplicate: matches.length > 0,
    matches,
  };
}

async function createEnquiry(ctx: AuthContext, input: {
  campusId: string;
  academicYearId?: string;
  studentName: string;
  phone: string;
  email?: string;
  programId?: string;
  programName?: string;
  source?: string;
  notes?: string;
}) {
  authorize(ctx, 'admissions.enquiry.create');
  const tenantId = getTenantId(ctx);

  const dup = await AdmissionsRepo.findDuplicateEnquiry(tenantId, input.phone, input.email);
  if (dup) {
    const dup2 = dup as unknown as Record<string, unknown>;
    throw new AppError('CONFLICT', `An enquiry already exists for this contact (phone: ${input.phone}). Existing ID: ${String(dup2._id ?? dup2.id)}`);
  }

  const enquiry = await AdmissionsRepo.createEnquiry(tenantId, {
    campusId:       new Types.ObjectId(input.campusId),
    academicYearId: input.academicYearId ? new Types.ObjectId(input.academicYearId) : undefined,
    studentName:    input.studentName,
    phone:          input.phone,
    email:          input.email,
    programId:      input.programId ? new Types.ObjectId(input.programId) : undefined,
    programName:    input.programName,
    source:         input.source,
    notes:          input.notes,
    status:         'NEW',
    createdBy:      new Types.ObjectId(ctx.membership!.profileId),
  });

  await AuditLogger.logTenantAction({
    ctx, action: 'ENQUIRY_CREATED',
    entityType: 'Enquiry', entityId: enquiry._id.toString(), entityName: input.studentName,
    after: input as unknown as Record<string, unknown>,
  });

  return enquiry;
}

export async function handleEnquiries(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listEnquiries':
    case 'GET:/api/admissions/enquiries': {
      authorize(ctx, 'admissions.enquiry.read');
      const inputFilter = (args.filter as Record<string, unknown> | undefined) ?? {};
      const filter: Record<string, unknown> = {};
      const status = inputFilter.status ?? args.status;
      const campusId = inputFilter.campusId ?? args.campusId;
      const academicYearId = inputFilter.academicYearId ?? args.academicYearId;
      const programId = inputFilter.programId ?? args.programId;
      const source = inputFilter.source ?? args.source;
      const search = String(inputFilter.search ?? args.search ?? '').trim();
      if (status) filter.status = status;
      if (campusId) filter.campusId = campusId;
      if (academicYearId) filter.academicYearId = academicYearId;
      if (programId) filter.programId = programId;
      if (source) filter.source = source;
      if (search) {
        filter.$or = [
          { studentName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }
      const enquiryList = await AdmissionsRepo.listEnquiries(tenantId, filter);
      return (enquiryList as unknown[]).map(d => toGql(d));
    }
    case 'getEnquiry':
    case 'GET:/api/admissions/enquiries/:id':
      authorize(ctx, 'admissions.enquiry.read');
      return toGql(await AdmissionsRepo.findEnquiryById(tenantId, args.id as string));
    case 'createPublicEnquiry':
    case 'POST:/api/public/admissions/enquiries':
      if (!args.tenantId) throw new AppError('BAD_REQUEST', 'tenantId is required for public enquiry');
      const publicEnquiry = await AdmissionsRepo.createEnquiry(args.tenantId as string, {
        campusId:    new Types.ObjectId(args.campusId as string),
        studentName: args.studentName as string,
        email:       args.email       as string | undefined,
        phone:       args.phone       as string,
        programId:   args.programId   ? new Types.ObjectId(args.programId as string) : undefined,
        notes:       args.notes       as string | undefined,
        source:      'PUBLIC_FORM',
        status:      'NEW',
      });
      return { success: true, id: publicEnquiry._id };
    case 'createEnquiry':
    case 'POST:/api/admissions/enquiries':
      return toGql(await createEnquiry(ctx, ((args.input as Record<string, unknown>) ?? args) as Parameters<typeof createEnquiry>[1]));
    case 'updateEnquiry':
    case 'PATCH:/api/admissions/enquiries/:id': {
      authorize(ctx, 'admissions.enquiry.update');
      const { id, input: enquiryInput, ...restArgs } = args as Record<string, unknown>;
      const update = (enquiryInput as Record<string, unknown>) ?? restArgs;
      return toGql(await AdmissionsRepo.updateEnquiry(tenantId, id as string, update));
    }
    case 'deleteEnquiry':
    case 'DELETE:/api/admissions/enquiries/:id':
      authorize(ctx, 'admissions.enquiry.delete');
      await AdmissionsRepo.deleteEnquiry(tenantId, args.id as string);
      return true;
    case 'checkDuplicate':
    case 'POST:/api/admissions/duplicate-check': {
      authorize(ctx, 'admissions.enquiry.read');
      const dupInput = (args.input ?? args) as Record<string, unknown>;
      return findDuplicateMatches(tenantId, {
        studentName: String(dupInput.studentName ?? ''),
        phone: dupInput.phone as string | undefined,
        email: dupInput.email as string | undefined,
        dob: dupInput.dob as string | undefined,
        campusId: dupInput.campusId as string | undefined,
      });
    }
    default:
      return undefined;
  }
}
