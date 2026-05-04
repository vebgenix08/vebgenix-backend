import { AcademicYear } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveAcademicYears(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listAcademicYears':
    case 'GET:/api/admin/settings/academic-years':
      return AcademicYear.find({ tenantId }).sort({ startDate: -1 }).lean();

    case 'getAcademicYear':
    case 'GET:/api/admin/settings/academic-years/:id':
      return AcademicYear.findOne({ tenantId, _id: args.id as string }).lean();

    case 'createAcademicYear':
    case 'POST:/api/admin/settings/academic-years': {
      authorize(ctx, 'settings.academic_year.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return AcademicYear.create({ ...input, tenantId });
    }

    case 'updateAcademicYear':
    case 'PATCH:/api/admin/settings/academic-years/:id': {
      authorize(ctx, 'settings.academic_year.update');
      const { id, ...input } = args as Record<string, unknown>;
      return AcademicYear.findOneAndUpdate(
        { tenantId, _id: id as string },
        { $set: input },
        { new: true },
      ).lean();
    }

    case 'setActiveAcademicYear':
    case 'POST:/api/admin/settings/academic-years/:id/activate': {
      authorize(ctx, 'settings.academic_year.update');
      await AcademicYear.updateMany({ tenantId }, { $set: { isActive: false } });
      return AcademicYear.findOneAndUpdate(
        { tenantId, _id: args.id as string },
        { $set: { isActive: true } },
        { new: true },
      ).lean();
    }

    default:
      return undefined;
  }
}
