import { Class, Section } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveSections(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listAllSections':
    case 'GET:/api/tenant/sections': {
      const filter: Record<string, unknown> = { tenantId, isActive: true };
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.classId)        filter.classId        = args.classId;
      return Section.find(filter).sort({ displayName: 1 }).lean();
    }

    case 'listSections':
    case 'GET:/api/tenant/classes/:classId/sections':
      return Section.find({ tenantId, classId: args.classId, isActive: true }).sort({ name: 1 }).lean();

    case 'getSection':
    case 'GET:/api/tenant/sections/:sectionId':
      return Section.findOne({ tenantId, _id: args.sectionId ?? args.id }).lean();

    case 'createSection':
    case 'POST:/api/tenant/classes/:classId/sections': {
      authorize(ctx, 'academics.sections.create');
      const classDoc = await Class.findOne({ tenantId, _id: args.classId }).lean();
      if (!classDoc) throw new AppError('NOT_FOUND', 'Class not found');
      const input       = (args.input as Record<string, unknown>) ?? args;
      const displayName = `${classDoc.name} — ${input.name}`;
      return Section.create({ ...input, tenantId, classId: args.classId, displayName });
    }

    case 'updateSection':
    case 'PATCH:/api/tenant/classes/:classId/sections/:sectionId': {
      authorize(ctx, 'academics.sections.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId ?? args.id },
        { $set: input },
        { new: true },
      ).lean();
    }

    case 'deleteSection':
    case 'DELETE:/api/tenant/classes/:classId/sections/:sectionId':
      authorize(ctx, 'academics.sections.delete');
      return Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean();

    case 'setSectionIncharge':
    case 'assignSectionIncharge':
    case 'POST:/api/tenant/sections/:sectionId/incharges':
      authorize(ctx, 'academics.sections.update');
      return Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId },
        { $set: { classTeacherId: args.profileId ?? args.teacherId } },
        { new: true },
      ).lean();

    case 'removeSectionIncharge':
    case 'DELETE:/api/tenant/sections/:sectionId/incharges/:inchargeId':
      authorize(ctx, 'academics.sections.update');
      return Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId },
        { $unset: { classTeacherId: '' } },
        { new: true },
      ).lean();

    default:
      return undefined;
  }
}
