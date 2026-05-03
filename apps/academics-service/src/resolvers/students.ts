import { AcademicsRepo, Student } from '@vebgenix/db';
import { Types } from 'mongoose';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { EnrollStudent } from '../use-cases/EnrollStudent';

export async function resolveStudents(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudents':
    case 'GET:/api/admin/students':
      return AcademicsRepo.listStudents(tenantId, (args.filter ?? {}) as Record<string, unknown>);

    case 'getStudent':
    case 'GET:/api/admin/students/:studentId':
      return AcademicsRepo.findStudentById(tenantId, (args.studentId ?? args.id) as string);

    case 'enrollStudent':
    case 'POST:/api/admin/students':
      return EnrollStudent.execute(ctx, args as unknown as Parameters<typeof EnrollStudent.execute>[1]);

    case 'convertApplicationToStudent':
      return EnrollStudent.execute(ctx, args as unknown as Parameters<typeof EnrollStudent.execute>[1]);

    case 'updateStudent':
    case 'PATCH:/api/admin/students/:studentId':
      return AcademicsRepo.updateStudent(tenantId, (args.studentId ?? args.id) as string, args as object);

    case 'updateStudentStatus':
    case 'PATCH:/api/admin/students/:studentId/status':
      authorize(ctx, 'students.status.update');
      return AcademicsRepo.updateStudent(
        tenantId,
        (args.studentId ?? args.id) as string,
        { status: args.status as never },
      );

    case 'assignStudentClass':
    case 'PATCH:/api/tenant/students/:studentId/assign-class':
      authorize(ctx, 'academics.students.assign');
      return AcademicsRepo.updateStudent(
        tenantId,
        (args.studentId ?? args.id) as string,
        { classId: args.classId as never, sectionId: args.sectionId as never },
      );

    case 'bulkAssignStudentsToClass':
    case 'POST:/api/tenant/students/bulk-assign-class': {
      authorize(ctx, 'academics.students.assign');
      const { classId, sectionId, studentIds } = args as {
        classId: string; sectionId?: string; studentIds: string[];
      };
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new AppError('BAD_REQUEST', 'studentIds must be a non-empty array');
      }
      const update: Record<string, unknown> = { classId };
      if (sectionId) update.sectionId = sectionId;
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
      if (args.campusId) filter.campusId = args.campusId;
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
      return Student.find({ tenantId, sectionId: args.sectionId, status: 'ACTIVE' })
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
