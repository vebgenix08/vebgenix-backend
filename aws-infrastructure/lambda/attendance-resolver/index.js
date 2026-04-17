'use strict';

const { getPrisma } = require('lambda-shared/db');
const { withTenant } = require('lambda-shared/withTenant');

/**
 * AttendanceLambda — AppSync resolver for the Attendance domain
 *
 * Handles:
 *  - markClassAttendance    — upsert bulk attendance records for a section/date
 *  - getClassAttendance     — fetch all attendance records for a section on a date
 *  - getStudentAttendance   — fetch attendance records for a student over a date range
 *  - getAttendanceSummary   — per-student attendance stats for a section over a date range
 *
 * All DB queries use withTenant() to activate RLS.
 */
exports.handler = async (event) => {
  const fieldName = event.fieldName ?? event.info?.fieldName;
  const args      = event.arguments ?? {};
  const identity  = event.identity  ?? null;

  const tenantId = identity?.claims?.['custom:tenant_id'];
  const userId   = identity?.claims?.sub;

  console.log(JSON.stringify({ fieldName, tenantId, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {

    // ── Query.listSectionStudents ────────────────────────────────────────────
    // Returns all active students assigned to a section (for attendance marking).
    case 'listSectionStudents': {
      const { sectionId } = args;

      const students = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.student.findMany({
          where: {
            sectionId,
            status: 'ACTIVE',
          },
          select: {
            id:              true,
            fullName:        true,
            admissionNumber: true,
          },
          orderBy: { fullName: 'asc' },
        })
      );

      return students.map((s) => ({
        id:              s.id,
        fullName:        s.fullName,
        admissionNumber: s.admissionNumber ?? null,
      }));
    }

    // ── Mutation.markClassAttendance ─────────────────────────────────────────
    // Upserts attendance for every student in records[].
    // Returns the saved AttendanceRecord list.
    case 'markClassAttendance': {
      const { sectionId, campusId, date, records } = args.input;

      const saved = await withTenant(prisma, tenantId, userId, async (tx) => {
        const results = [];

        for (const rec of records) {
          const row = await tx.attendance.upsert({
            where: {
              studentId_sectionId_date: {
                studentId: rec.studentId,
                sectionId,
                date: new Date(date),
              },
            },
            update: {
              status:   rec.status,
              remarks:  rec.remarks ?? null,
              markedBy: userId ?? null,
            },
            create: {
              tenantId,
              studentId: rec.studentId,
              sectionId,
              campusId,
              date:     new Date(date),
              status:   rec.status,
              remarks:  rec.remarks ?? null,
              markedBy: userId ?? null,
            },
            include: {
              student: {
                select: {
                  id:              true,
                  fullName:        true,
                  admissionNumber: true,
                },
              },
            },
          });
          results.push(row);
        }

        return results;
      });

      return saved.map(mapAttendanceRecord);
    }

    // ── Query.getClassAttendance ─────────────────────────────────────────────
    case 'getClassAttendance': {
      const { sectionId, date } = args;

      const records = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.attendance.findMany({
          where: {
            sectionId,
            date: new Date(date),
          },
          include: {
            student: {
              select: {
                id:              true,
                fullName:        true,
                admissionNumber: true,
              },
            },
          },
          orderBy: { student: { fullName: 'asc' } },
        })
      );

      return records.map(mapAttendanceRecord);
    }

    // ── Query.getStudentAttendance ───────────────────────────────────────────
    case 'getStudentAttendance': {
      const { studentId, from, to } = args;

      const records = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.attendance.findMany({
          where: {
            studentId,
            date: { gte: new Date(from), lte: new Date(to) },
          },
          include: {
            student: {
              select: {
                id:              true,
                fullName:        true,
                admissionNumber: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        })
      );

      return records.map(mapAttendanceRecord);
    }

    // ── Query.getAttendanceSummary ───────────────────────────────────────────
    case 'getAttendanceSummary': {
      const { sectionId, from, to } = args;

      const records = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.attendance.findMany({
          where: {
            sectionId,
            date: { gte: new Date(from), lte: new Date(to) },
          },
          include: {
            student: {
              select: {
                id:              true,
                fullName:        true,
                admissionNumber: true,
              },
            },
          },
        })
      );

      // Count unique dates to determine total school days in range
      const uniqueDates = new Set(records.map((r) => r.date.toISOString().split('T')[0]));
      const totalDays = uniqueDates.size;

      // Group by student
      const byStudent = new Map();
      for (const r of records) {
        if (!byStudent.has(r.studentId)) {
          byStudent.set(r.studentId, {
            student: r.student,
            present: 0, absent: 0, late: 0, excused: 0,
          });
        }
        const s = byStudent.get(r.studentId);
        const st = r.status.toLowerCase();
        if (st === 'present') s.present++;
        else if (st === 'absent') s.absent++;
        else if (st === 'late')   s.late++;
        else if (st === 'excused') s.excused++;
      }

      const studentRecords = Array.from(byStudent.values()).map((s) => {
        const attended = s.present + s.late; // late counts as attended
        const total    = s.present + s.absent + s.late + s.excused;
        return {
          studentId: s.student.id,
          student: {
            id:              s.student.id,
            fullName:        s.student.fullName,
            admissionNumber: s.student.admissionNumber ?? null,
          },
          present: s.present,
          absent:  s.absent,
          late:    s.late,
          excused: s.excused,
          attendancePercentage: total > 0 ? Math.round((attended / total) * 1000) / 10 : 0,
        };
      });

      return {
        sectionId,
        from,
        to,
        totalDays,
        records: studentRecords,
      };
    }

    default:
      throw new Error(`Unhandled field: ${fieldName}`);
  }
};

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapAttendanceRecord(r) {
  return {
    id:        r.id,
    studentId: r.studentId,
    student: {
      id:              r.student.id,
      fullName:        r.student.fullName,
      admissionNumber: r.student.admissionNumber ?? null,
    },
    sectionId: r.sectionId,
    campusId:  r.campusId,
    date:      r.date.toISOString().split('T')[0],
    status:    r.status,
    remarks:   r.remarks ?? null,
    markedBy:  r.markedBy ?? null,
  };
}
