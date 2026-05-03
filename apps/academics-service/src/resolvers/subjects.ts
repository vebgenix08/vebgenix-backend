import { Subject, SubjectAllocation } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

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
      return Subject.find(filter).sort({ name: 1 }).lean();
    }

    case 'getSubject':
    case 'GET:/api/tenant/subjects/:subjectId':
      return Subject.findOne({ tenantId, _id: args.subjectId ?? args.id }).lean();

    case 'createSubject':
    case 'POST:/api/tenant/subjects': {
      authorize(ctx, 'academics.subjects.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Subject.create({ ...input, tenantId });
    }

    case 'updateSubject':
    case 'PATCH:/api/tenant/subjects/:subjectId': {
      authorize(ctx, 'academics.subjects.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Subject.findOneAndUpdate(
        { tenantId, _id: args.subjectId ?? args.id },
        { $set: input },
        { new: true },
      ).lean();
    }

    case 'deleteSubject':
    case 'DELETE:/api/tenant/subjects/:subjectId':
      authorize(ctx, 'academics.subjects.delete');
      return Subject.findOneAndUpdate(
        { tenantId, _id: args.subjectId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean();

    // ── Subject Allocations ────────────────────────────────────────────────────

    case 'listSectionCourses':
    case 'GET:/api/tenant/sections/:sectionId/courses':
      return SubjectAllocation.find({ tenantId, sectionId: args.sectionId, isActive: true }).lean();

    case 'assignSectionCourse':
    case 'POST:/api/tenant/sections/:sectionId/courses': {
      authorize(ctx, 'academics.allocations.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return SubjectAllocation.create({ ...input, tenantId, sectionId: args.sectionId });
    }

    case 'updateSectionCourse':
    case 'PATCH:/api/tenant/sections/:sectionId/courses/:allocationId': {
      authorize(ctx, 'academics.allocations.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return SubjectAllocation.findOneAndUpdate(
        { tenantId, _id: args.allocationId ?? args.id },
        { $set: input },
        { new: true },
      ).lean();
    }

    case 'removeSectionCourse':
    case 'DELETE:/api/tenant/sections/:sectionId/courses/:allocationId':
      authorize(ctx, 'academics.allocations.delete');
      return SubjectAllocation.findOneAndUpdate(
        { tenantId, _id: args.allocationId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean();

    default:
      return undefined;
  }
}
