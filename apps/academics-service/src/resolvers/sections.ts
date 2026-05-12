import { Class, Section } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

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
      const docs = await Section.find(filter).sort({ displayName: 1 }).lean();
      return docs.map(d => toGql(d));
    }

    case 'listSections':
    case 'GET:/api/tenant/classes/:classId/sections': {
      const docs = await Section.find({ tenantId, classId: args.classId, isActive: true }).sort({ name: 1 }).lean();
      return docs.map(d => toGql(d));
    }

    case 'getSection':
    case 'GET:/api/tenant/sections/:sectionId':
      return toGql(await Section.findOne({ tenantId, _id: args.sectionId ?? args.id }).lean());

    case 'createSection':
    case 'POST:/api/tenant/classes/:classId/sections': {
      authorize(ctx, 'academics.sections.create');
      const classDoc = await Class.findOne({ tenantId, _id: args.classId }).lean();
      if (!classDoc) throw new AppError('NOT_FOUND', 'Class not found');
      const input       = (args.input as Record<string, unknown>) ?? args;
      const displayName = `${classDoc.name} — ${input.name}`;
      const doc = await Section.create({ ...input, tenantId, classId: args.classId, displayName });
      return toGql(doc.toObject());
    }

    case 'updateSection':
    case 'PATCH:/api/tenant/classes/:classId/sections/:sectionId': {
      authorize(ctx, 'academics.sections.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return toGql(await Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId ?? args.id },
        { $set: input },
        { new: true },
      ).lean());
    }

    case 'deleteSection':
    case 'DELETE:/api/tenant/classes/:classId/sections/:sectionId':
      authorize(ctx, 'academics.sections.delete');
      return Boolean(await Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean());

    case 'setSectionIncharge':
    case 'assignSectionIncharge':
    case 'POST:/api/tenant/sections/:sectionId/incharges':
      authorize(ctx, 'academics.sections.update');
      return toGql(await Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId },
        { $set: { classTeacherId: args.profileId ?? args.teacherId } },
        { new: true },
      ).lean());

    case 'removeSectionIncharge':
    case 'DELETE:/api/tenant/sections/:sectionId/incharges/:inchargeId':
      authorize(ctx, 'academics.sections.update');
      return toGql(await Section.findOneAndUpdate(
        { tenantId, _id: args.sectionId },
        { $unset: { classTeacherId: '' } },
        { new: true },
      ).lean());

    default:
      return undefined;
  }
}
