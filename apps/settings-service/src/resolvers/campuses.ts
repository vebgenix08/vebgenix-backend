import { Campus } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveCampuses(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listCampuses':
    case 'GET:/api/admin/settings/campuses':
      return Campus.find({ tenantId, isActive: true }).sort({ name: 1 }).lean();

    case 'getCampus':
    case 'GET:/api/admin/settings/campuses/:id':
      return Campus.findOne({ tenantId, _id: args.id as string }).lean();

    case 'createCampus':
    case 'POST:/api/admin/settings/campuses': {
      authorize(ctx, 'tenant.campuses.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Campus.create({ ...input, tenantId });
    }

    case 'updateCampus':
    case 'PATCH:/api/admin/settings/campuses/:id': {
      authorize(ctx, 'tenant.campuses.update');
      const { id, ...update } = args as Record<string, unknown>;
      return Campus.findOneAndUpdate(
        { tenantId, _id: id as string },
        { $set: update },
        { new: true },
      ).lean();
    }

    case 'deactivateCampus':
    case 'DELETE:/api/admin/settings/campuses/:id': {
      authorize(ctx, 'tenant.campuses.delete');
      return Campus.findOneAndUpdate(
        { tenantId, _id: args.id as string },
        { $set: { isActive: false } },
        { new: true },
      ).lean();
    }

    default:
      return undefined;
  }
}
