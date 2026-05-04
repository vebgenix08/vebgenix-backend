import { Class } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

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
      return Class.find(filter).sort({ name: 1 }).lean();
    }

    case 'getClass':
    case 'GET:/api/tenant/classes/:classId':
      return Class.findOne({ tenantId, _id: args.classId ?? args.id }).lean();

    case 'createClass':
    case 'POST:/api/tenant/classes': {
      authorize(ctx, 'academics.classes.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Class.create({ ...input, tenantId });
    }

    case 'updateClass':
    case 'PATCH:/api/tenant/classes/:classId': {
      authorize(ctx, 'academics.classes.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Class.findOneAndUpdate(
        { tenantId, _id: args.classId ?? args.id },
        { $set: input },
        { new: true },
      ).lean();
    }

    case 'deleteClass':
    case 'DELETE:/api/tenant/classes/:classId':
      authorize(ctx, 'academics.classes.delete');
      return Class.findOneAndUpdate(
        { tenantId, _id: args.classId ?? args.id },
        { $set: { isActive: false } },
        { new: true },
      ).lean();

    default:
      return undefined;
  }
}
