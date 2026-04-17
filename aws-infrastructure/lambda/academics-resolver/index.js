'use strict';

const { getPrisma } = require('lambda-shared/db');
const { withTenant } = require('lambda-shared/withTenant');

/**
 * AcademicsLambda — AppSync resolver for the Academics domain
 *
 * Handles:
 *  - Timetable CRUD: getSectionTimetable, replaceSectionTimetable, getTeacherTimetable
 *  - Teacher workload: getTeacherWorkload
 *  - Bulk class assignment: bulkAssignStudentsToClass, randomAssignStudentsToClass
 *
 * All DB queries use withTenant() to activate RLS.
 */
exports.handler = async (event) => {
  const { fieldName, arguments: args, identity } = event;

  const tenantId = identity?.claims?.['custom:tenant_id'];
  const userId   = identity?.claims?.sub;

  console.log(JSON.stringify({ fieldName, tenantId, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {

    // ── Query.getSectionTimetable ────────────────────────────────────────────
    case 'getSectionTimetable': {
      const { sectionId } = args;

      const slots = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.timetableSlot.findMany({
          where: { sectionId },
          include: {
            subject: { select: { id: true, name: true, code: true, subjectType: true } },
            teacher: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
        })
      );

      return {
        sectionId,
        slots: slots.map(mapSlot),
      };
    }

    // ── Mutation.replaceSectionTimetable ─────────────────────────────────────
    case 'replaceSectionTimetable': {
      const { sectionId, slots: slotInputs } = args;

      // Verify section belongs to this tenant
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.findFirstOrThrow({
          where: { id: sectionId, class: { program: { tenantId } } },
        })
      );

      // Atomic replace: delete all, re-create
      await withTenant(prisma, tenantId, userId, async (tx) => {
        await tx.timetableSlot.deleteMany({ where: { sectionId } });
        if (slotInputs && slotInputs.length > 0) {
          await tx.timetableSlot.createMany({
            data: slotInputs.map((s) => ({
              sectionId,
              subjectId: s.subjectId || null,
              teacherProfileId: s.teacherProfileId || null,
              dayOfWeek: s.dayOfWeek,
              periodNumber: s.periodNumber,
              startTime: s.startTime,
              endTime: s.endTime,
              room: s.room || null,
              label: s.label || null,
              isBreak: s.isBreak ?? false,
            })),
          });
        }
      });

      // Re-fetch saved slots with relations
      const saved = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.timetableSlot.findMany({
          where: { sectionId },
          include: {
            subject: { select: { id: true, name: true, code: true, subjectType: true } },
            teacher: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
        })
      );

      return {
        sectionId,
        slots: saved.map(mapSlot),
      };
    }

    // ── Query.getTeacherTimetable ────────────────────────────────────────────
    case 'getTeacherTimetable': {
      const { profileId } = args;

      // Verify profile belongs to tenant
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findFirstOrThrow({ where: { id: profileId, tenantId } })
      );

      const [slots, incharges] = await withTenant(prisma, tenantId, userId, async (tx) => {
        const s = await tx.timetableSlot.findMany({
          where: { teacherProfileId: profileId },
          include: {
            subject: { select: { id: true, name: true, code: true, subjectType: true } },
            teacher: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
            section: {
              include: {
                class: { select: { id: true, name: true } },
                campus: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
        });

        const i = await tx.classIncharge.findMany({
          where: { profileId, role: 'CLASS_TEACHER' },
          include: {
            section: {
              include: {
                class: { select: { id: true, name: true } },
                campus: { select: { id: true, name: true } },
              },
            },
          },
        });

        return [s, i];
      });

      return {
        slots: slots.map(mapSlotWithSection),
        incharges: incharges.map(mapIncharge),
      };
    }

    // ── Query.getTeacherWorkload ─────────────────────────────────────────────
    case 'getTeacherWorkload': {
      const { profileId } = args;

      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findFirstOrThrow({
          where: { id: profileId, tenantId },
          select: { id: true, fullName: true, email: true },
        })
      );

      const [allocations, incharges, timetableSlots] = await withTenant(
        prisma, tenantId, userId,
        async (tx) => {
          const a = await tx.subjectAllocation.findMany({
            where: { teacherProfileId: profileId },
            include: {
              subject: { select: { id: true, name: true, code: true, subjectType: true } },
              section: {
                include: {
                  class: { select: { id: true, name: true } },
                  campus: { select: { id: true, name: true } },
                },
              },
            },
          });

          const i = await tx.classIncharge.findMany({
            where: { profileId },
            include: {
              section: {
                include: {
                  class: { select: { id: true, name: true } },
                  campus: { select: { id: true, name: true } },
                },
              },
            },
          });

          const t = await tx.timetableSlot.findMany({
            where: { teacherProfileId: profileId, isBreak: false },
            include: {
              subject: { select: { id: true, name: true, code: true, subjectType: true } },
              section: {
                include: {
                  class: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
          });

          return [a, i, t];
        }
      );

      const uniqueSections = new Set(allocations.map((a) => a.sectionId));

      return {
        profile: { id: profile.id, fullName: profile.fullName, email: profile.email },
        allocations: allocations.map((a) => ({
          id: a.id,
          subjectType: a.subjectType,
          subject: {
            id: a.subject.id,
            name: a.subject.name,
            code: a.subject.code,
            subjectType: a.subject.subjectType,
          },
          section: mapSectionRef(a.section),
        })),
        incharges: incharges.map(mapIncharge),
        timetableSlots: timetableSlots.map(mapSlotWithSection),
        summary: {
          totalSubjects: allocations.length,
          totalSections: uniqueSections.size,
          classTeacherOf: incharges.filter((i) => i.role === 'CLASS_TEACHER').length,
          totalPeriodsPerWeek: timetableSlots.length,
        },
      };
    }

    // ── Mutation.bulkAssignStudentsToClass ────────────────────────────────────
    case 'bulkAssignStudentsToClass': {
      const { studentIds, classId, sectionId } = args;

      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new Error('studentIds must be a non-empty array');
      }

      // Verify section belongs to tenant
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.findFirstOrThrow({
          where: { id: sectionId, classId, class: { program: { tenantId } } },
        })
      );

      const result = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.student.updateMany({
          where: { id: { in: studentIds }, tenantId },
          data: { classId, sectionId },
        })
      );

      return { updated: result.count };
    }

    // ── Mutation.randomAssignStudentsToClass ──────────────────────────────────
    case 'randomAssignStudentsToClass': {
      const { classId, studentIds } = args;

      // Get all sections for this class
      const sections = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.findMany({
          where: { classId, class: { program: { tenantId } } },
          orderBy: { name: 'asc' },
        })
      );

      if (sections.length === 0) {
        throw new Error('No sections found for this class');
      }

      // Fetch students to assign
      const whereClause = {
        tenantId,
        classId,
        ...(studentIds && studentIds.length > 0
          ? { id: { in: studentIds } }
          : { sectionId: null }),
      };

      const students = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.student.findMany({
          where: whereClause,
          include: { application: { select: { gender: true } } },
          orderBy: { fullName: 'asc' },
        })
      );

      if (students.length === 0) {
        return { updated: 0, assignments: [] };
      }

      // Gender-balanced interleaved round-robin
      const male   = students.filter((s) => ['MALE', 'M'].includes((s.application?.gender || '').toUpperCase()));
      const female = students.filter((s) => ['FEMALE', 'F'].includes((s.application?.gender || '').toUpperCase()));
      const other  = students.filter((s) => !['MALE', 'M', 'FEMALE', 'F'].includes((s.application?.gender || '').toUpperCase()));

      const interleaved = [];
      const maxLen = Math.max(male.length, female.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < male.length)   interleaved.push(male[i]);
        if (i < female.length) interleaved.push(female[i]);
      }
      interleaved.push(...other);

      const assignments = interleaved.map((student, i) => {
        const section = sections[i % sections.length];
        return { studentId: student.id, sectionId: section.id, sectionName: section.name };
      });

      // Bulk update
      await withTenant(prisma, tenantId, userId, (tx) =>
        Promise.all(
          assignments.map(({ studentId, sectionId }) =>
            tx.student.update({
              where: { id: studentId },
              data: { classId, sectionId },
            })
          )
        )
      );

      return {
        updated: assignments.length,
        assignments,
      };
    }

    // ── Query.listClasses ────────────────────────────────────────────────────
    case 'listClasses': {
      const { programId } = args;
      const classes = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.class.findMany({
          where: { ...(programId ? { programId } : {}) },
          include: {
            program: { select: { id: true, name: true } },
            sections: { select: { id: true, name: true, campusId: true } },
          },
          orderBy: { name: 'asc' },
        })
      );
      return classes.map(mapClass);
    }

    // ── Mutation.createClass ─────────────────────────────────────────────────
    case 'createClass': {
      const { name, programId } = args.input;
      const cls = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.class.create({
          data: { name, programId },
          include: { program: { select: { id: true, name: true } } },
        })
      );
      return mapClass(cls);
    }

    // ── Mutation.updateClass ─────────────────────────────────────────────────
    case 'updateClass': {
      const { classId } = args;
      const { name, programId } = args.input;
      const cls = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.class.update({
          where: { id: classId },
          data: { ...(name ? { name } : {}), ...(programId ? { programId } : {}) },
          include: { program: { select: { id: true, name: true } } },
        })
      );
      return mapClass(cls);
    }

    // ── Mutation.deleteClass ─────────────────────────────────────────────────
    case 'deleteClass': {
      const { classId } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.class.delete({ where: { id: classId } })
      );
      return true;
    }

    // ── Query.listSections ───────────────────────────────────────────────────
    case 'listSections': {
      const { classId } = args;
      const sections = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.findMany({
          where: { classId },
          include: {
            class: { include: { program: { select: { id: true, name: true } } } },
            campus: { select: { id: true, name: true } },
            _count: { select: { students: true, allocations: true } },
          },
          orderBy: { name: 'asc' },
        })
      );
      return sections.map(mapSection);
    }

    // ── Query.listAllSections ────────────────────────────────────────────────
    case 'listAllSections': {
      const { campusId, programId } = args;
      const sections = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.findMany({
          where: {
            ...(campusId ? { campusId } : {}),
            ...(programId ? { class: { programId } } : {}),
          },
          include: {
            class: { include: { program: { select: { id: true, name: true } } } },
            campus: { select: { id: true, name: true } },
            _count: { select: { students: true, allocations: true } },
          },
          orderBy: [{ class: { name: 'asc' } }, { name: 'asc' }],
        })
      );
      return sections.map(mapSection);
    }

    // ── Query.getSection ─────────────────────────────────────────────────────
    case 'getSection': {
      const { sectionId } = args;
      const section = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.findFirstOrThrow({
          where: { id: sectionId },
          include: {
            class: { include: { program: { select: { id: true, name: true } } } },
            campus: { select: { id: true, name: true } },
            _count: { select: { students: true, allocations: true } },
          },
        })
      );
      return mapSection(section);
    }

    // ── Mutation.createSection ───────────────────────────────────────────────
    case 'createSection': {
      const { classId } = args;
      const { name, campusId } = args.input;
      const section = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.create({
          data: { name, classId, campusId },
          include: {
            class: { include: { program: { select: { id: true, name: true } } } },
            campus: { select: { id: true, name: true } },
            _count: { select: { students: true, allocations: true } },
          },
        })
      );
      return mapSection(section);
    }

    // ── Mutation.updateSection ───────────────────────────────────────────────
    case 'updateSection': {
      const { sectionId } = args;
      const { name, campusId } = args.input;
      const section = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.update({
          where: { id: sectionId },
          data: { ...(name ? { name } : {}), ...(campusId ? { campusId } : {}) },
          include: {
            class: { include: { program: { select: { id: true, name: true } } } },
            campus: { select: { id: true, name: true } },
            _count: { select: { students: true, allocations: true } },
          },
        })
      );
      return mapSection(section);
    }

    // ── Mutation.deleteSection ───────────────────────────────────────────────
    case 'deleteSection': {
      const { sectionId } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.section.delete({ where: { id: sectionId } })
      );
      return true;
    }

    // ── Query.listSubjects ───────────────────────────────────────────────────
    case 'listSubjects': {
      const subjects = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subject.findMany({
          orderBy: { name: 'asc' },
        })
      );
      return subjects.map(mapSubject);
    }

    // ── Mutation.createSubject ───────────────────────────────────────────────
    case 'createSubject': {
      const { name, code, description, subjectType, credits } = args.input;
      const subject = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subject.create({
          data: { name, code: code || null, description: description || null, subjectType: subjectType || null, credits: credits || null },
        })
      );
      return mapSubject(subject);
    }

    // ── Mutation.updateSubject ───────────────────────────────────────────────
    case 'updateSubject': {
      const { subjectId } = args;
      const { name, code, description, subjectType, credits } = args.input;
      const subject = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subject.update({
          where: { id: subjectId },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(code !== undefined ? { code } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(subjectType !== undefined ? { subjectType } : {}),
            ...(credits !== undefined ? { credits } : {}),
          },
        })
      );
      return mapSubject(subject);
    }

    // ── Mutation.deleteSubject ───────────────────────────────────────────────
    case 'deleteSubject': {
      const { subjectId } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subject.delete({ where: { id: subjectId } })
      );
      return true;
    }

    // ── Query.listSectionCourses ─────────────────────────────────────────────
    case 'listSectionCourses': {
      const { sectionId } = args;
      const allocations = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subjectAllocation.findMany({
          where: { sectionId },
          include: {
            subject: true,
            teacher: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        })
      );
      return allocations.map(mapAllocation);
    }

    // ── Mutation.assignSectionCourse ─────────────────────────────────────────
    case 'assignSectionCourse': {
      const { sectionId } = args;
      const { subjectId, teacherProfileId, subjectType } = args.input;
      const allocation = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subjectAllocation.create({
          data: {
            sectionId,
            subjectId,
            teacherProfileId: teacherProfileId || null,
            subjectType: subjectType || null,
          },
          include: {
            subject: true,
            teacher: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
        })
      );
      return mapAllocation(allocation);
    }

    // ── Mutation.updateSectionCourse ─────────────────────────────────────────
    case 'updateSectionCourse': {
      const { allocationId } = args;
      const { teacherProfileId, subjectType } = args.input;
      const allocation = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subjectAllocation.update({
          where: { id: allocationId },
          data: {
            ...(teacherProfileId !== undefined ? { teacherProfileId: teacherProfileId || null } : {}),
            ...(subjectType !== undefined ? { subjectType: subjectType || null } : {}),
          },
          include: {
            subject: true,
            teacher: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          },
        })
      );
      return mapAllocation(allocation);
    }

    // ── Mutation.removeSectionCourse ─────────────────────────────────────────
    case 'removeSectionCourse': {
      const { allocationId } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.subjectAllocation.delete({ where: { id: allocationId } })
      );
      return true;
    }

    // ── Query.listSectionIncharges ───────────────────────────────────────────
    case 'listSectionIncharges': {
      const { sectionId } = args;
      const incharges = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.classIncharge.findMany({
          where: { sectionId },
          include: {
            profile: { select: { id: true, fullName: true, email: true } },
          },
        })
      );
      return incharges.map(mapInchargeDetail);
    }

    // ── Mutation.assignSectionIncharge ───────────────────────────────────────
    case 'assignSectionIncharge': {
      const { sectionId } = args;
      const { profileId, role } = args.input;
      // Upsert: replace existing incharge for this role
      const incharge = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.classIncharge.upsert({
          where: { sectionId_role_academicYearId: { sectionId, role, academicYearId: null } },
          update: { profileId },
          create: { sectionId, profileId, role },
          include: {
            profile: { select: { id: true, fullName: true, email: true } },
          },
        })
      );
      return mapInchargeDetail(incharge);
    }

    // ── Mutation.removeSectionIncharge ───────────────────────────────────────
    case 'removeSectionIncharge': {
      const { inchargeId } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.classIncharge.delete({ where: { id: inchargeId } })
      );
      return true;
    }

    // ── Mutation.assignStudentToClass ────────────────────────────────────────
    case 'assignStudentToClass': {
      const { studentId, classId, sectionId } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.student.update({
          where: { id: studentId },
          data: { classId, sectionId },
        })
      );
      return true;
    }

    default:
      throw new Error(`AcademicsLambda: unknown field "${fieldName}"`);
  }
};

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapSlot(s) {
  return {
    id:               s.id,
    sectionId:        s.sectionId,
    subjectId:        s.subjectId,
    teacherProfileId: s.teacherProfileId,
    dayOfWeek:        s.dayOfWeek,
    periodNumber:     s.periodNumber,
    startTime:        s.startTime,
    endTime:          s.endTime,
    room:             s.room,
    label:            s.label,
    isBreak:          s.isBreak,
    subject:          s.subject ? { id: s.subject.id, name: s.subject.name, code: s.subject.code, subjectType: s.subject.subjectType } : null,
    teacher:          s.teacher ? { id: s.teacher.id, fullName: s.teacher.fullName, email: s.teacher.email, avatarUrl: s.teacher.avatarUrl } : null,
  };
}

function mapSectionRef(sec) {
  return {
    id:     sec.id,
    name:   sec.name,
    class:  sec.class  ? { id: sec.class.id,  name: sec.class.name  } : null,
    campus: sec.campus ? { id: sec.campus.id, name: sec.campus.name } : null,
  };
}

function mapSlotWithSection(s) {
  return {
    ...mapSlot(s),
    section: s.section ? mapSectionRef(s.section) : null,
  };
}

function mapIncharge(i) {
  return {
    id:      i.id,
    role:    i.role,
    section: mapSectionRef(i.section),
  };
}

function mapClass(c) {
  return {
    id:        c.id,
    name:      c.name,
    programId: c.programId,
    program:   c.program  ? { id: c.program.id,  name: c.program.name  } : null,
    sections:  c.sections ? c.sections.map((s) => ({ id: s.id, name: s.name, campusId: s.campusId })) : null,
  };
}

function mapSection(s) {
  return {
    id:       s.id,
    name:     s.name,
    classId:  s.classId,
    campusId: s.campusId,
    class:    s.class  ? mapClass(s.class)  : null,
    campus:   s.campus ? { id: s.campus.id, name: s.campus.name } : null,
    _count:   s._count ? { students: s._count.students, allocations: s._count.allocations } : null,
  };
}

function mapSubject(s) {
  return {
    id:          s.id,
    name:        s.name,
    code:        s.code        ?? null,
    description: s.description ?? null,
    subjectType: s.subjectType ?? null,
    credits:     s.credits     ?? null,
  };
}

function mapAllocation(a) {
  return {
    id:               a.id,
    sectionId:        a.sectionId,
    subjectId:        a.subjectId,
    teacherProfileId: a.teacherProfileId ?? null,
    subjectType:      a.subjectType      ?? null,
    subject:          a.subject ? mapSubject(a.subject) : null,
    teacher:          a.teacher ? { id: a.teacher.id, fullName: a.teacher.fullName, email: a.teacher.email, avatarUrl: a.teacher.avatarUrl } : null,
  };
}

function mapInchargeDetail(i) {
  return {
    id:        i.id,
    sectionId: i.sectionId,
    profileId: i.profileId,
    role:      i.role,
    profile:   i.profile ? { id: i.profile.id, fullName: i.profile.fullName, email: i.profile.email } : null,
  };
}
