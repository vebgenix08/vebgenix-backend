import { AcademicsRepo, Attendance, Student } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';

export async function resolveAttendance(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    // ── Read: by section / date ───────────────────────────────────────────────
    case 'getSectionAttendance':
    case 'getClassAttendance':                               // alias — same semantics
    case 'GET:/api/tenant/sections/:sectionId/attendance':
      return AcademicsRepo.listAttendance(
        tenantId,
        { sectionId: args.sectionId as string },
        new Date(args.date as string),
      );

    case 'listAttendance':
      return AcademicsRepo.listAttendance(
        tenantId,
        { classId: args.classId as string },
        new Date(args.date as string),
      );

    // ── Read: by student + date range ─────────────────────────────────────────
    case 'getStudentAttendance':
    case 'GET:/api/tenant/students/:studentId/attendance': {
      const { studentId, from, to } = args as { studentId: string; from: string; to: string };
      return Attendance.find({
        tenantId,
        studentId: new Types.ObjectId(studentId),
        date: { $gte: new Date(from), $lte: new Date(to) },
      })
        .sort({ date: 1 })
        .lean();
    }

    // ── Mark attendance ───────────────────────────────────────────────────────
    case 'markAttendance':
    case 'markSectionAttendance':
    case 'markClassAttendance':                              // alias — same semantics
    case 'PUT:/api/tenant/sections/:sectionId/attendance': {
      authorize(ctx, 'academics.attendance.mark');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const { records } = input as {
        records: Array<{ studentId: string; status: string; remarks?: string }>;
      };
      if (!Array.isArray(records)) throw new AppError('BAD_REQUEST', 'records array required');
      const date      = new Date(input.date as string);
      const sectionId = (input.sectionId ?? args.sectionId) as string;
      const campusId  = (input.campusId  ?? args.campusId)  as string | undefined;
      const sectionObjectId = new Types.ObjectId(sectionId);
      const campusObjectId  = campusId ? new Types.ObjectId(campusId) : undefined;
      const ops = records.map(r => ({
        updateOne: {
          filter: { tenantId, studentId: new Types.ObjectId(r.studentId), date },
          update: {
            $set: {
              tenantId,
              studentId: new Types.ObjectId(r.studentId),
              sectionId: sectionObjectId,
              campusId:  campusObjectId,
              date,
              status:   r.status,
              remarks:  r.remarks,
              markedBy: new Types.ObjectId(ctx.membership!.profileId),
            },
          },
          upsert: true,
        },
      }));
      const { modifiedCount, upsertedCount } = await Attendance.bulkWrite(ops as never);
      return { marked: modifiedCount + upsertedCount, date: date.toISOString(), records: records.map(r => ({ studentId: r.studentId, status: r.status })) };
    }

    // ── Summaries ─────────────────────────────────────────────────────────────
    case 'getSectionAttendanceSummary':
    case 'getAttendanceSummary':                            // alias — same semantics
    case 'GET:/api/tenant/sections/:sectionId/attendance/summary': {
      const { sectionId, fromDate, toDate, from, to } = args as {
        sectionId: string; fromDate?: string; toDate?: string; from?: string; to?: string;
      };
      const start = new Date((fromDate ?? from) as string);
      const end   = new Date((toDate   ?? to)   as string);
      const sectionObjectId = new Types.ObjectId(sectionId);

      // Count total school days in range
      const totalDays = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      );

      // Fetch all students in section for name info
      const students = await Student.find({ tenantId, sectionId: sectionObjectId, status: 'ACTIVE' })
        .select('_id firstName lastName fullName registrationNumber')
        .lean();
      const studentMap = new Map(students.map(s => [s._id.toString(), s]));

      const rows = await Attendance.aggregate([
        {
          $match: {
            tenantId,
            sectionId: sectionObjectId,
            date: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id:      '$studentId',
            present:  { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] },  1, 0] } },
            absent:   { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] },   1, 0] } },
            late:     { $sum: { $cond: [{ $eq: ['$status', 'LATE'] },     1, 0] } },
            excused:  { $sum: { $cond: [{ $eq: ['$status', 'EXCUSED'] },  1, 0] } },
          },
        },
      ]);

      const records = rows.map(r => {
        const s = studentMap.get(r._id?.toString() ?? '');
        return {
          studentId: r._id,
          student: {
            id:              r._id,
            firstName:       s?.firstName,
            lastName:        s?.lastName,
            fullName:        s?.fullName ?? 'Unknown',
            registrationNumber: s?.registrationNumber,
            admissionNumber: s?.registrationNumber,
          },
          present:             r.present,
          absent:              r.absent,
          late:                r.late,
          excused:             r.excused,
          attendancePercentage:
            totalDays > 0
              ? Math.round(((r.present + r.late) / totalDays) * 10000) / 100
              : 0,
        };
      });

      return {
        sectionId,
        from:      start.toISOString().split('T')[0],
        to:        end.toISOString().split('T')[0],
        totalDays,
        records,
      };
    }

    default:
      return undefined;
  }
}
