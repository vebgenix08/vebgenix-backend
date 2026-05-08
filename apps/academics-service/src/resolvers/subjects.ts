import { Subject, SubjectAllocation } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
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
      const doc = await Subject.create({ ...input, tenantId });
      return toGql(doc.toObject());
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
      return toGql(await Subject.findOneAndUpdate(
        { tenantId, _id: args.subjectId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean());

    // ── Subject Allocations ────────────────────────────────────────────────────

    case 'listSectionCourses':
    case 'GET:/api/tenant/sections/:sectionId/courses': {
      const docs = await SubjectAllocation.find({ tenantId, sectionId: args.sectionId, isActive: true }).lean();
      return docs.map(d => toGql(d));
    }

    case 'assignSectionCourse':
    case 'POST:/api/tenant/sections/:sectionId/courses': {
      authorize(ctx, 'academics.allocations.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      const doc = await SubjectAllocation.create({ ...input, tenantId, sectionId: args.sectionId });
      return toGql(doc.toObject());
    }

    case 'updateSectionCourse':
    case 'PATCH:/api/tenant/sections/:sectionId/courses/:allocationId': {
      authorize(ctx, 'academics.allocations.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return toGql(await SubjectAllocation.findOneAndUpdate(
        { tenantId, _id: args.allocationId ?? args.id },
        { $set: input },
        { new: true },
      ).lean());
    }

    case 'removeSectionCourse':
    case 'DELETE:/api/tenant/sections/:sectionId/courses/:allocationId':
      authorize(ctx, 'academics.allocations.delete');
      return toGql(await SubjectAllocation.findOneAndUpdate(
        { tenantId, _id: args.allocationId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean());

    default:
      return undefined;
  }
}
