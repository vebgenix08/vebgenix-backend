import { Campus } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: String(_id) };
}

export async function resolveCampuses(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listCampuses':
    case 'GET:/api/admin/settings/campuses': {
      const docs = await Campus.find({ tenantId, isActive: true }).sort({ name: 1 }).lean();
      return docs.map(d => toGql(d as Record<string, unknown>));
    }

    case 'getCampus':
    case 'GET:/api/admin/settings/campuses/:id':
      return toGql(await Campus.findOne({ tenantId, _id: args.id as string }).lean() as Record<string, unknown> | null);

    case 'createCampus':
    case 'POST:/api/admin/settings/campuses': {
      authorize(ctx, 'tenant.campuses.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      const doc = await Campus.create({ ...input, tenantId });
      return toGql(doc.toObject() as unknown as Record<string, unknown>);
    }

    case 'updateCampus':
    case 'PATCH:/api/admin/settings/campuses/:id': {
      authorize(ctx, 'tenant.campuses.update');
      const { id, input } = args as Record<string, unknown>;
      const update = (input as Record<string, unknown>) ?? args;
      return toGql(await Campus.findOneAndUpdate(
        { tenantId, _id: id as string },
        { $set: update },
        { new: true },
      ).lean() as Record<string, unknown> | null);
    }

    case 'deactivateCampus':
    case 'DELETE:/api/admin/settings/campuses/:id': {
      authorize(ctx, 'tenant.campuses.delete');
      return toGql(await Campus.findOneAndUpdate(
        { tenantId, _id: args.id as string },
        { $set: { isActive: false } },
        { new: true },
      ).lean() as Record<string, unknown> | null);
    }

    default:
      return undefined;
  }
}
