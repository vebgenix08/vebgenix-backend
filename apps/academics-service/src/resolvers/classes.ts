import { Class } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function resolveClasses(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listClasses':
    case 'GET:/api/tenant/classes': {
      const filter: Record<string, unknown> = { tenantId, isActive: true };
      if (args.campusId)  filter.campusId  = args.campusId;
      if (args.programId) filter.programId = args.programId;
      const docs = await Class.find(filter).sort({ name: 1 }).lean();
      return docs.map(d => toGql(d));
    }

    case 'getClass':
    case 'GET:/api/tenant/classes/:classId':
      return toGql(await Class.findOne({ tenantId, _id: args.classId ?? args.id }).lean());

    case 'createClass':
    case 'POST:/api/tenant/classes': {
      authorize(ctx, 'academics.classes.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      try {
        const doc = await Class.create({ ...input, tenantId });
        return toGql(doc.toObject());
      } catch (e: unknown) {
        const err = e as { code?: number; message?: string };
        if (err.code === 11000) throw new AppError('CONFLICT', 'A class with this code already exists for this tenant');
        throw e;
      }
    }

    case 'updateClass':
    case 'PATCH:/api/tenant/classes/:classId': {
      authorize(ctx, 'academics.classes.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return toGql(await Class.findOneAndUpdate(
        { tenantId, _id: args.classId ?? args.id },
        { $set: input },
        { new: true },
      ).lean());
    }

    case 'deleteClass':
    case 'DELETE:/api/tenant/classes/:classId':
      authorize(ctx, 'academics.classes.delete');
      return toGql(await Class.findOneAndUpdate(
        { tenantId, _id: args.classId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean());

    default:
      return undefined;
  }
}
