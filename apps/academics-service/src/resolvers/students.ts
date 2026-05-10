import { AcademicsRepo, AdmissionsRepo, Student } from '@vebgenix/db';
import { Types } from 'mongoose';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { EnrollStudent } from '../use-cases/EnrollStudent';

function toGqlStudent(student: unknown) {
  if (!student) return student;
  const doc = (student as { toObject?: () => Record<string, unknown> }).toObject?.()
    ?? (student as Record<string, unknown>);
  const { _id, ...rest } = doc;
  return { ...rest, id: String(doc.id ?? _id) };
}

export async function resolveStudents(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudents':
    case 'GET:/api/admin/students': {
      const students = await AcademicsRepo.listStudents(tenantId, (args.filter ?? {}) as Record<string, unknown>);
      return {
        items: students.map(toGqlStudent),
        nextToken: null,
      };
    }

    case 'getStudent':
    case 'GET:/api/admin/students/:studentId':
      return toGqlStudent(await AcademicsRepo.findStudentById(tenantId, (args.studentId ?? args.id) as string));

    case 'enrollStudent':
    case 'POST:/api/admin/students': {
      const student = await EnrollStudent.execute(ctx, ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof EnrollStudent.execute>[1]);
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

      const student = await EnrollStudent.execute(ctx, {
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
