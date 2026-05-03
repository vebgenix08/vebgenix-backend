import { Program } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolvePrograms(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listPrograms':
    case 'GET:/api/admin/settings/programs':
      return Program.find({ tenantId, isActive: true }).sort({ name: 1 }).lean();

    case 'getProgram':
    case 'GET:/api/admin/settings/programs/:id':
      return Program.findOne({ tenantId, _id: args.id as string }).lean();

    case 'createProgram':
    case 'POST:/api/admin/settings/programs': {
      authorize(ctx, 'settings.programs.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Program.create({ ...input, tenantId });
    }

    case 'updateProgram':
    case 'PATCH:/api/admin/settings/programs/:id': {
      authorize(ctx, 'settings.programs.update');
      const { id, ...update } = args as Record<string, unknown>;
      return Program.findOneAndUpdate(
        { tenantId, _id: id as string },
        { $set: update },
        { new: true },
      ).lean();
    }

    case 'deleteProgram':
    case 'DELETE:/api/admin/settings/programs/:id': {
      authorize(ctx, 'settings.programs.delete');
      return Program.findOneAndUpdate(
        { tenantId, _id: args.id as string },
        { $set: { isActive: false } },
        { new: true },
      ).lean();
    }

    default:
      return undefined;
  }
}
