import { Timetable } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveTimetable(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'getSectionTimetable':
    case 'GET:/api/tenant/sections/:sectionId/timetable': {
      authorize(ctx, 'academics.timetable.read');
      return Timetable.findOne({
        tenantId,
        classId:        args.sectionId ?? args.classId,
        academicYearId: args.academicYearId,
      }).lean();
    }

    case 'getTeacherTimetable':
    case 'GET:/api/tenant/teachers/:profileId/timetable': {
      authorize(ctx, 'academics.timetable.read');
      const teacherId  = (args.profileId ?? args.teacherId) as string;
      const timetables = await Timetable.find({
        tenantId,
        academicYearId:    args.academicYearId,
        'slots.teacherId': teacherId,
      }).lean();
      return timetables.map(tt => ({
        classId:   tt.classId,
        className: tt.className,
        slots:     tt.slots.filter(s => s.teacherId === teacherId),
      }));
    }

    case 'getTeacherWorkload':
    case 'GET:/api/tenant/teachers/:profileId/workload': {
      authorize(ctx, 'academics.timetable.read');
      const teacherId  = (args.profileId ?? args.teacherId) as string;
      const timetables = await Timetable.find({
        tenantId,
        academicYearId:    args.academicYearId,
        'slots.teacherId': teacherId,
      }).lean();
      const slots = timetables.flatMap(tt => tt.slots.filter(s => s.teacherId === teacherId));
      return {
        teacherId,
        totalPeriodsPerWeek: slots.length,
        subjectBreakdown: Object.entries(
          slots.reduce<Record<string, number>>((acc, s) => {
            acc[s.subjectName] = (acc[s.subjectName] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([subject, periods]) => ({ subject, periods })),
      };
    }

    case 'replaceSectionTimetable':
    case 'PUT:/api/tenant/sections/:sectionId/timetable': {
      authorize(ctx, 'academics.timetable.manage');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Timetable.findOneAndUpdate(
        {
          tenantId,
          classId:        args.sectionId ?? input.classId,
          academicYearId: input.academicYearId,
        },
        { $set: { ...input, tenantId, updatedBy: ctx.membership!.profileId } },
        { upsert: true, new: true },
      ).lean();
    }

    default:
      return undefined;
  }
}
