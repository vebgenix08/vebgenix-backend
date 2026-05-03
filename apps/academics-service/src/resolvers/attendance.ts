import { AcademicsRepo, Attendance } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveAttendance(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'getSectionAttendance':
    case 'GET:/api/tenant/sections/:sectionId/attendance':
      return AcademicsRepo.listAttendance(
        tenantId,
        args.sectionId as string,
        new Date(args.date as string),
      );

    case 'listAttendance':
      return AcademicsRepo.listAttendance(
        tenantId,
        args.classId as string,
        new Date(args.date as string),
      );

    case 'markAttendance':
    case 'markSectionAttendance':
    case 'PUT:/api/tenant/sections/:sectionId/attendance': {
      authorize(ctx, 'academics.attendance.mark');
      const { records } = args as {
        records: Array<{ studentId: string; status: string; remarks?: string }>;
      };
      if (!Array.isArray(records)) throw new AppError('BAD_REQUEST', 'records array required');
      const date = new Date(args.date as string);
      const ops  = records.map(r => ({
        updateOne: {
          filter: { tenantId, studentId: r.studentId, date },
          update: {
            $set: {
              tenantId,
              studentId: r.studentId,
              sectionId: args.sectionId,
              date,
              status:    r.status,
              remarks:   r.remarks,
              markedBy:  ctx.membership!.profileId,
            },
          },
          upsert: true,
        },
      }));
      const { modifiedCount, upsertedCount } = await Attendance.bulkWrite(ops as never);
      return { marked: modifiedCount + upsertedCount, date: date.toISOString() };
    }

    case 'getSectionAttendanceSummary':
    case 'GET:/api/tenant/sections/:sectionId/attendance/summary': {
      const { sectionId, fromDate, toDate } = args as {
        sectionId: string; fromDate: string; toDate: string;
      };
      return Attendance.aggregate([
        {
          $match: {
            tenantId, sectionId,
            date: { $gte: new Date(fromDate), $lte: new Date(toDate) },
          },
        },
        {
          $group: {
            _id:     '$studentId',
            present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
            absent:  { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] },  1, 0] } },
            total:   { $sum: 1 },
          },
        },
        {
          $addFields: {
            attendancePercent: { $multiply: [{ $divide: ['$present', '$total'] }, 100] },
          },
        },
      ]);
    }

    default:
      return undefined;
  }
}
