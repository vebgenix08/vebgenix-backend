import { AcademicsRepo, Attendance, Section, Student } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';

function toPlainDoc(doc: unknown): Record<string, unknown> {
  return (doc as { toObject?: () => Record<string, unknown> }).toObject?.()
    ?? (doc as Record<string, unknown>);
}

function asId(value: unknown): string {
  return value == null ? '' : String(value);
}

function asDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return new Date(value as string).toISOString().split('T')[0];
}

function assertSectionScope(
  section: Record<string, unknown>,
  scope: { campusId?: unknown; academicYearId?: unknown },
) {
  if (scope.campusId && asId(section.campusId) !== String(scope.campusId)) {
    throw new AppError('BAD_REQUEST', 'Section does not belong to the selected campus.');
  }
  if (scope.academicYearId && asId(section.academicYearId) !== String(scope.academicYearId)) {
    throw new AppError('BAD_REQUEST', 'Section does not belong to the selected academic year.');
  }
}

function toAttendanceStudentInfo(studentId: string, student?: Record<string, unknown>) {
  const firstName = student?.firstName as string | undefined;
  const lastName  = student?.lastName  as string | undefined;
  return {
    id:                 asId(student?._id ?? student?.id ?? studentId),
    firstName,
    lastName,
    fullName:           (student?.fullName as string | undefined) || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown',
    registrationNumber: student?.registrationNumber,
    admissionNumber:    student?.admissionNumber ?? student?.admissionNo,
  };
}

async function toAttendanceRecords(rows: unknown[], tenantId: string) {
  const docs = rows.map(toPlainDoc);
  const studentIds = Array.from(new Set(docs.map(r => asId(r.studentId)).filter(Boolean)));
  const students = studentIds.length > 0
    ? await Student.find({ tenantId, _id: { $in: studentIds.map(id => new Types.ObjectId(id)) } })
      .select('_id firstName lastName fullName registrationNumber admissionNumber admissionNo')
      .lean()
    : [];
  const studentMap = new Map(students.map(s => [s._id.toString(), s as Record<string, unknown>]));

  return docs.map(row => {
    const studentId = asId(row.studentId);
    return {
      id:        asId(row._id ?? row.id),
      studentId,
      student:   toAttendanceStudentInfo(studentId, studentMap.get(studentId)),
      sectionId: asId(row.sectionId),
      campusId:  asId(row.campusId),
      date:      asDate(row.date),
      status:    row.status,
      remarks:   row.remarks,
      markedBy:  row.markedBy ? asId(row.markedBy) : null,
    };
  });
}

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
    case 'GET:/api/tenant/sections/:sectionId/attendance': {
      const section = await Section.findOne({ tenantId, _id: args.sectionId as string }).lean();
      if (!section) throw new AppError('NOT_FOUND', 'Section not found');
      assertSectionScope(section as Record<string, unknown>, {
        campusId: args.campusId,
        academicYearId: args.academicYearId,
      });
      const rows = await AcademicsRepo.listAttendance(
        tenantId,
        { sectionId: args.sectionId as string },
        new Date(args.date as string),
      );
      return toAttendanceRecords(rows, tenantId);
    }

    case 'listAttendance': {
      const rows = await AcademicsRepo.listAttendance(
        tenantId,
        { classId: args.classId as string },
        new Date(args.date as string),
      );
      return toAttendanceRecords(rows, tenantId);
    }

    // ── Read: by student + date range ─────────────────────────────────────────
    case 'getStudentAttendance':
    case 'GET:/api/tenant/students/:studentId/attendance': {
      const { studentId, from, to, campusId, academicYearId } = args as {
        studentId: string; from: string; to: string; campusId?: string; academicYearId?: string;
      };
      if (campusId || academicYearId) {
        const studentFilter: Record<string, unknown> = {
          tenantId,
          _id: new Types.ObjectId(studentId),
        };
        if (campusId) studentFilter.campusId = new Types.ObjectId(campusId);
        if (academicYearId) studentFilter.academicYearId = new Types.ObjectId(academicYearId);
        const student = await Student.findOne(studentFilter).select('_id').lean();
        if (!student) return [];
      }
      return Attendance.find({
        tenantId,
        studentId: new Types.ObjectId(studentId),
        ...(campusId ? { campusId: new Types.ObjectId(campusId) } : {}),
        date: { $gte: new Date(from), $lte: new Date(to) },
      })
        .sort({ date: 1 })
        .lean()
        .then(rows => toAttendanceRecords(rows, tenantId));
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
      if (records.length === 0) throw new AppError('BAD_REQUEST', 'records array cannot be empty');
      const date      = new Date(input.date as string);
      const sectionId = (input.sectionId ?? args.sectionId) as string;
      const campusId  = (input.campusId  ?? args.campusId)  as string | undefined;
      const academicYearId = (input.academicYearId ?? args.academicYearId) as string | undefined;
      const sectionObjectId = new Types.ObjectId(sectionId);
      const section = await Section.findOne({ tenantId, _id: sectionObjectId }).lean();
      if (!section) throw new AppError('NOT_FOUND', 'Section not found');
      assertSectionScope(section as Record<string, unknown>, { campusId, academicYearId });
      const classObjectId  = new Types.ObjectId(String((input.classId ?? section.classId) as string));
      const campusObjectId = new Types.ObjectId(String(campusId ?? section.campusId));
      const studentObjectIds = records.map(r => new Types.ObjectId(r.studentId));
      const ops = records.map(r => ({
        updateOne: {
          filter: { tenantId, studentId: new Types.ObjectId(r.studentId), date },
          update: {
            $set: {
              tenantId,
              studentId: new Types.ObjectId(r.studentId),
              sectionId: sectionObjectId,
              classId:   classObjectId,
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
      await Attendance.bulkWrite(ops as never);
      const rows = await Attendance.find({
        tenantId,
        studentId: { $in: studentObjectIds },
        date,
      }).lean();
      return toAttendanceRecords(rows, tenantId);
    }

    // ── Summaries ─────────────────────────────────────────────────────────────
    case 'getSectionAttendanceSummary':
    case 'getAttendanceSummary':                            // alias — same semantics
    case 'GET:/api/tenant/sections/:sectionId/attendance/summary': {
      const { sectionId, fromDate, toDate, from, to } = args as {
        sectionId: string; fromDate?: string; toDate?: string; from?: string; to?: string; campusId?: string; academicYearId?: string;
      };
      const start = new Date((fromDate ?? from) as string);
      const end   = new Date((toDate   ?? to)   as string);
      const sectionObjectId = new Types.ObjectId(sectionId);
      const section = await Section.findOne({ tenantId, _id: sectionObjectId }).lean();
      if (!section) throw new AppError('NOT_FOUND', 'Section not found');
      assertSectionScope(section as Record<string, unknown>, {
        campusId: args.campusId,
        academicYearId: args.academicYearId,
      });

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
