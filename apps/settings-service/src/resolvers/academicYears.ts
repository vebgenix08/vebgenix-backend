import { AcademicYear } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { isValidObjectId } from 'mongoose';

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
      const existing = await AcademicYear.findOne({ tenantId, name: input.name as string });
      if (existing) throw new AppError('CONFLICT', `Academic year "${input.name}" already exists`);
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
      const activateId = args.id as string;
      if (!activateId || !isValidObjectId(activateId)) throw new AppError('BAD_REQUEST', 'id is required');
      await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false, isCurrent: false } });
      const updated = await AcademicYear.findOneAndUpdate(
        { tenantId, _id: activateId },
        { $set: { isActive: true, isCurrent: true } },
        { new: true },
      ).lean();
      if (!updated) throw new AppError('NOT_FOUND', 'Academic year not found');
      return toGql(updated as Record<string, unknown>);
    }

    default:
      return undefined;
  }
}
