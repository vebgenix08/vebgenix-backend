import { Section, Subject, SubjectAllocation } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

function toSectionCourse(
  doc: unknown,
  subject?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const base = toGql(doc);
  if (!base) return null;
  return {
    ...base,
    teacherProfileId: base.teacherProfileId ?? base.teacherId ?? null,
    subjectName: base.subjectName ?? subject?.name ?? '',
    subjectCode: base.subjectCode ?? subject?.code ?? null,
  };
}

async function hydrateSectionCourses(
  docs: unknown[],
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  const subjectIds = [
    ...new Set(
      docs
        .map((doc) => toGql(doc))
        .map((doc) => String(doc?.subjectId ?? ''))
        .filter(Boolean),
    ),
  ];
  const subjects = subjectIds.length
    ? await Subject.find({ tenantId, _id: { $in: subjectIds } }).lean()
    : [];
  const subjectById = new Map(
    subjects.map((subject) => [String(subject._id), subject as Record<string, unknown>]),
  );

  return docs
    .map((doc) => toSectionCourse(doc, subjectById.get(String(toGql(doc)?.subjectId ?? ''))))
    .filter((doc): doc is Record<string, unknown> => Boolean(doc));
}

export async function resolveSubjects(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listSubjects':
    case 'GET:/api/tenant/subjects': {
      const filter: Record<string, unknown> = { tenantId, isActive: true };
      if (args.campusId) filter.campusId = args.campusId;
      const docs = await Subject.find(filter).sort({ name: 1 }).lean();
      return docs.map(d => toGql(d));
    }

    case 'getSubject':
    case 'GET:/api/tenant/subjects/:subjectId':
      return toGql(await Subject.findOne({ tenantId, _id: args.subjectId ?? args.id }).lean());

    case 'createSubject':
    case 'POST:/api/tenant/subjects': {
      authorize(ctx, 'academics.subjects.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      try {
        const doc = await Subject.create({ ...input, tenantId });
        return toGql(doc.toObject());
      } catch (e: unknown) {
        const err = e as { code?: number; message?: string };
        if (err.code === 11000) throw new AppError('CONFLICT', 'A subject with this code already exists for this tenant');
        throw e;
      }
    }

    case 'updateSubject':
    case 'PATCH:/api/tenant/subjects/:subjectId': {
      authorize(ctx, 'academics.subjects.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return toGql(await Subject.findOneAndUpdate(
        { tenantId, _id: args.subjectId ?? args.id },
        { $set: input },
        { new: true },
      ).lean());
    }

    case 'deleteSubject':
    case 'DELETE:/api/tenant/subjects/:subjectId':
      authorize(ctx, 'academics.subjects.delete');
      return Boolean(await Subject.findOneAndUpdate(
        { tenantId, _id: args.subjectId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean());

    // ── Subject Allocations ────────────────────────────────────────────────────

    case 'listSectionCourses':
    case 'GET:/api/tenant/sections/:sectionId/courses': {
      const docs = await SubjectAllocation.find({ tenantId, sectionId: args.sectionId, isActive: true })
        .sort({ subjectName: 1 })
        .lean();
      return hydrateSectionCourses(docs, tenantId);
    }

    case 'assignSectionCourse':
    case 'POST:/api/tenant/sections/:sectionId/courses': {
      authorize(ctx, 'academics.allocations.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      const sectionId = String(args.sectionId ?? input.sectionId ?? '');
      const subjectId = String(input.subjectId ?? '');
      if (!sectionId || !subjectId) throw new AppError('BAD_REQUEST', 'sectionId and subjectId are required');

      const [section, subject] = await Promise.all([
        Section.findOne({ tenantId, _id: sectionId, isActive: true }).lean(),
        Subject.findOne({ tenantId, _id: subjectId, isActive: true }).lean(),
      ]);
      if (!section) throw new AppError('NOT_FOUND', 'Section not found');
      if (!subject) throw new AppError('NOT_FOUND', 'Subject not found');

      const teacherProfileId = input.teacherProfileId ?? input.teacherId;
      const payload: Record<string, unknown> = {
        tenantId,
        sectionId,
        subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        academicYearId: section.academicYearId,
        periodsPerWeek: input.periodsPerWeek ?? 5,
        isActive: true,
      };
      if (teacherProfileId) {
        payload.teacherId = String(teacherProfileId);
        payload.teacherName = String(input.teacherName ?? '');
      }

      const existing = await SubjectAllocation.findOne({
        tenantId,
        sectionId,
        subjectId,
        academicYearId: section.academicYearId,
      });
      const doc = existing
        ? await SubjectAllocation.findOneAndUpdate(
            { tenantId, _id: existing._id },
            { $set: payload },
            { new: true },
          ).lean()
        : (await SubjectAllocation.create(payload)).toObject();

      return toSectionCourse(doc, subject as Record<string, unknown>);
    }

    case 'updateSectionCourse':
    case 'PATCH:/api/tenant/sections/:sectionId/courses/:allocationId': {
      authorize(ctx, 'academics.allocations.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      const update = { ...input } as Record<string, unknown>;
      if (update.teacherProfileId) {
        update.teacherId = update.teacherProfileId;
        delete update.teacherProfileId;
      }
      const doc = await SubjectAllocation.findOneAndUpdate(
        { tenantId, _id: args.allocationId ?? args.id },
        { $set: update },
        { new: true },
      ).lean();
      return (await hydrateSectionCourses(doc ? [doc] : [], tenantId))[0] ?? null;
    }

    case 'removeSectionCourse':
    case 'DELETE:/api/tenant/sections/:sectionId/courses/:allocationId':
      authorize(ctx, 'academics.allocations.delete');
      return Boolean(await SubjectAllocation.findOneAndUpdate(
        { tenantId, sectionId: args.sectionId, _id: args.allocationId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean());

    default:
      return undefined;
  }
}
