import { AcademicYear } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

function toGql(doc: Record<string, unknown> | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  // `isActive` may be missing on old docs that only have `isCurrent`
  const isActive = rest.isActive ?? rest.isCurrent ?? false;
  return { ...rest, id: String(_id), isActive };
}

export async function resolveAcademicYears(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listAcademicYears':
    case 'GET:/api/admin/settings/academic-years': {
      const docs = await AcademicYear.find({ tenantId }).sort({ startDate: -1 }).lean();
      return docs.map(d => toGql(d as Record<string, unknown>));
    }

    case 'getAcademicYear':
    case 'GET:/api/admin/settings/academic-years/:id':
      return toGql(await AcademicYear.findOne({ tenantId, _id: args.id as string }).lean() as Record<string, unknown> | null);

    case 'createAcademicYear':
    case 'POST:/api/admin/settings/academic-years': {
      authorize(ctx, 'settings.academic_year.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      const doc = await AcademicYear.create({ ...input, tenantId });
      return toGql(doc.toObject() as unknown as Record<string, unknown>);
    }

    case 'updateAcademicYear':
    case 'PATCH:/api/admin/settings/academic-years/:id': {
      authorize(ctx, 'settings.academic_year.update');
      const { id, input } = args as Record<string, unknown>;
      const update = (input as Record<string, unknown>) ?? {};
      return toGql(await AcademicYear.findOneAndUpdate(
        { tenantId, _id: id as string },
        { $set: update },
        { new: true },
      ).lean() as Record<string, unknown> | null);
    }

    case 'setActiveAcademicYear':
    case 'POST:/api/admin/settings/academic-years/:id/activate': {
      authorize(ctx, 'settings.academic_year.update');
      await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false, isCurrent: false } });
      return toGql(await AcademicYear.findOneAndUpdate(
        { tenantId, _id: args.id as string },
        { $set: { isActive: true, isCurrent: true } },
        { new: true },
      ).lean() as Record<string, unknown> | null);
    }

    default:
      return undefined;
  }
}
