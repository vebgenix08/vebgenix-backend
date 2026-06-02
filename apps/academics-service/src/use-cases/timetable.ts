import { Campus, Class, Profile, Section, Subject, Timetable } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

type TimetableSlotInputLike = {
  subjectId?: string;
  teacherProfileId?: string;
  teacherId?: string;
  dayOfWeek?: string;
  day?: string;
  periodNumber?: number;
  period?: number;
  startTime?: string;
  endTime?: string;
  room?: string;
  roomId?: string;
  label?: string;
  isBreak?: boolean;
  subjectName?: string;
  teacherName?: string;
};

type TimetableSlotDoc = {
  subjectId?: string;
  subjectName?: string;
  teacherId?: string;
  teacherName?: string;
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  room?: string;
  roomId?: string;
  label?: string;
  isBreak?: boolean;
};

function toGqlSlot(slot: TimetableSlotDoc, sectionId: string) {
  const subjectName = slot.subjectName ?? slot.label;
  return {
    id:               `${sectionId}:${slot.day}:${slot.period}`,
    sectionId,
    subjectId:        slot.subjectId ?? null,
    teacherProfileId: slot.teacherId ?? null,
    dayOfWeek:        slot.day,
    periodNumber:     slot.period,
    startTime:        slot.startTime,
    endTime:          slot.endTime,
    room:             slot.room ?? slot.roomId ?? null,
    label:            slot.label ?? subjectName ?? null,
    isBreak:          slot.isBreak === true,
    subject:          slot.subjectId
      ? { id: slot.subjectId, name: subjectName ?? 'Subject', code: null, subjectType: null }
      : null,
    teacher:          slot.teacherId
      ? { id: slot.teacherId, fullName: slot.teacherName ?? null, email: null, avatarUrl: null }
      : null,
  };
}

function toSectionRef(sectionId: string, section?: Record<string, unknown> | null, classDoc?: Record<string, unknown> | null, campus?: Record<string, unknown> | null) {
  return {
    id:     sectionId,
    name:   (section?.name as string | undefined) ?? (section?.displayName as string | undefined) ?? 'Section',
    class:  classDoc ? { id: String(classDoc._id ?? classDoc.id), name: classDoc.name as string } : null,
    campus: campus ? { id: String(campus._id ?? campus.id), name: campus.name as string } : null,
  };
}

function toSectionTimetable(doc: Record<string, unknown> | null, sectionId: string) {
  const slots = (doc?.slots as TimetableSlotDoc[] | undefined) ?? [];
  return {
    sectionId,
    slots: slots.map(slot => toGqlSlot(slot, sectionId)),
  };
}

export async function handleTimetable(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'getSectionTimetable':
    case 'GET:/api/tenant/sections/:sectionId/timetable': {
      authorize(ctx, 'academics.timetable.read');
      const sectionId = (args.sectionId ?? args.classId) as string;
      const query: Record<string, unknown> = { tenantId, classId: sectionId };
      if (args.academicYearId) query.academicYearId = args.academicYearId;
      const timetable = await Timetable.findOne(query).sort({ updatedAt: -1 }).lean() as unknown as Record<string, unknown> | null;
      return toSectionTimetable(timetable, sectionId);
    }

    case 'getTeacherTimetable':
    case 'GET:/api/tenant/teachers/:profileId/timetable': {
      authorize(ctx, 'academics.timetable.read');
      const teacherId  = (args.profileId ?? args.teacherId) as string;
      const query: Record<string, unknown> = {
        tenantId,
        'slots.teacherId': teacherId,
      };
      if (args.academicYearId) query.academicYearId = args.academicYearId;
      const timetables = await Timetable.find(query).lean();
      const slots = timetables.flatMap(tt => {
        const sectionId = String(tt.classId);
        return tt.slots
          .filter(s => s.teacherId === teacherId)
          .map(s => ({
            ...toGqlSlot(s as TimetableSlotDoc, sectionId),
            section: {
              id: sectionId,
              name: tt.className,
              class: null,
              campus: null,
            },
          }));
      });
      return { slots, incharges: [] };
    }

    case 'getTeacherWorkload':
    case 'GET:/api/tenant/teachers/:profileId/workload': {
      authorize(ctx, 'academics.timetable.read');
      const teacherId  = (args.profileId ?? args.teacherId) as string;
      const query: Record<string, unknown> = {
        tenantId,
        'slots.teacherId': teacherId,
      };
      if (args.academicYearId) query.academicYearId = args.academicYearId;
      const [teacher, timetables] = await Promise.all([
        Profile.findById(teacherId).lean() as Promise<Record<string, unknown> | null>,
        Timetable.find(query).lean(),
      ]);
      const slots = timetables.flatMap(tt => {
        const sectionId = String(tt.classId);
        return tt.slots
          .filter(s => s.teacherId === teacherId)
          .map(s => ({
            ...toGqlSlot(s as TimetableSlotDoc, sectionId),
            section: {
              id: sectionId,
              name: tt.className,
              class: null,
              campus: null,
            },
          }));
      });
      const subjects = new Set(slots.map(s => s.subjectId).filter(Boolean));
      const sections = new Set(slots.map(s => s.sectionId).filter(Boolean));
      return {
        profile: {
          id:       teacherId,
          fullName: teacher?.fullName as string | undefined,
          email:    teacher?.email as string | undefined,
        },
        allocations: [],
        incharges: [],
        timetableSlots: slots,
        summary: {
          totalSubjects: subjects.size,
          totalSections: sections.size,
          classTeacherOf: 0,
          totalPeriodsPerWeek: slots.length,
        },
      };
    }

    case 'replaceSectionTimetable':
    case 'PUT:/api/tenant/sections/:sectionId/timetable': {
      authorize(ctx, 'academics.timetable.manage');
      const input = (args.input as Record<string, unknown>) ?? args;
      const sectionId = (args.sectionId ?? input.sectionId) as string;
      const rawSlots = (args.slots ?? input.slots) as TimetableSlotInputLike[] | undefined;
      if (!sectionId) throw new AppError('BAD_REQUEST', 'sectionId is required');
      if (!Array.isArray(rawSlots)) throw new AppError('BAD_REQUEST', 'slots array is required');

      const section = await Section.findOne({ tenantId, _id: sectionId }).lean() as unknown as Record<string, unknown> | null;
      if (!section) throw new AppError('NOT_FOUND', 'Section not found');
      const [classDoc, campus] = await Promise.all([
        Class.findOne({ tenantId, _id: section.classId }).lean() as Promise<Record<string, unknown> | null>,
        Campus.findOne({ tenantId, _id: section.campusId }).lean() as Promise<Record<string, unknown> | null>,
      ]);

      const subjectIds = Array.from(new Set(rawSlots.map(s => s.subjectId).filter(Boolean))) as string[];
      const teacherIds = Array.from(new Set(rawSlots.map(s => s.teacherProfileId ?? s.teacherId).filter(Boolean))) as string[];
      const [subjects, teachers] = await Promise.all([
        subjectIds.length ? Subject.find({ tenantId, _id: { $in: subjectIds } }).lean() : [],
        teacherIds.length ? Profile.find({ tenantId, _id: { $in: teacherIds } }).lean() : [],
      ]);
      const subjectMap = new Map(subjects.map(s => [s._id.toString(), s]));
      const teacherMap = new Map(teachers.map(t => [t._id.toString(), t]));

      const slots = rawSlots.map((slot): TimetableSlotDoc => {
        const subjectId = slot.subjectId;
        const teacherId = slot.teacherProfileId ?? slot.teacherId;
        const subject = subjectId ? subjectMap.get(subjectId) : undefined;
        const teacher = teacherId ? teacherMap.get(teacherId) : undefined;
        return {
          day:         (slot.dayOfWeek ?? slot.day) as string,
          period:      Number(slot.periodNumber ?? slot.period),
          subjectId,
          subjectName: slot.subjectName ?? subject?.name,
          teacherId,
          teacherName: slot.teacherName ?? teacher?.fullName,
          room:        slot.room,
          roomId:      slot.roomId,
          label:       slot.label,
          isBreak:     slot.isBreak === true,
          startTime:   slot.startTime as string,
          endTime:     slot.endTime as string,
        };
      });

      const timetable = await Timetable.findOneAndUpdate(
        {
          tenantId,
          classId:        sectionId,
          academicYearId: String(section.academicYearId),
        },
        {
          $set: {
            tenantId,
            campusId:       String(section.campusId),
            academicYearId: String(section.academicYearId),
            classId:        sectionId,
            className:      (section.displayName as string | undefined) ?? `${classDoc?.name ?? 'Class'} - ${section.name}`,
            slots,
            updatedBy:      ctx.membership!.profileId,
          },
        },
        { upsert: true, new: true },
      ).lean() as unknown as Record<string, unknown>;
      const sectionRef = toSectionRef(sectionId, section, classDoc, campus);
      return {
        ...toSectionTimetable(timetable, sectionId),
        section: sectionRef,
      };
    }

    default:
      return undefined;
  }
}
