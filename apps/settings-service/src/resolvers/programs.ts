import { Program } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

export async function resolvePrograms(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listPrograms':
    case 'GET:/api/admin/settings/programs': {
      const filter: Record<string, unknown> = { tenantId, isActive: true };
      if (args.campusId) filter.campusId = args.campusId;
      const docs = await Program.find(filter).sort({ name: 1 }).lean();
      return docs.map((d) => { const { _id, ...rest } = d as unknown as Record<string, unknown>; return { ...rest, id: String(_id) }; });
    }

    case 'getProgram':
    case 'GET:/api/admin/settings/programs/:id':
      return Program.findOne({ tenantId, _id: args.id as string }).lean();

    case 'createProgram':
    case 'POST:/api/admin/settings/programs': {
      authorize(ctx, 'settings.programs.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      try {
        const doc = await Program.create({ ...input, tenantId });
        const obj = doc.toObject() as unknown as Record<string, unknown>;
        return { ...obj, id: String(obj._id) };
      } catch (e: unknown) {
        const err = e as { code?: number; message?: string; errors?: Record<string, { message: string }> };
        if (err.code === 11000) throw new AppError('CONFLICT', 'A program with this code already exists for this tenant');
        if (err.errors) {
          const firstMsg = Object.values(err.errors)[0]?.message;
          throw new AppError('BAD_REQUEST', firstMsg ?? 'Validation error');
        }
        throw new AppError('INTERNAL', err.message ?? 'Failed to create program');
      }
    }

    case 'updateProgram':
    case 'PATCH:/api/admin/settings/programs/:id': {
      authorize(ctx, 'settings.programs.update');
      const id = (args.id ?? args.programId) as string;
      const input = (args.input as Record<string, unknown>) ?? {};
      const doc = await Program.findOneAndUpdate(
        { tenantId, _id: id },
        { $set: input },
        { new: true },
      ).lean();
      if (!doc) throw new AppError('NOT_FOUND', 'Program not found');
      const { _id, ...rest } = doc as unknown as Record<string, unknown>;
      return { ...rest, id: String(_id) };
    }

    case 'deleteProgram':
    case 'DELETE:/api/admin/settings/programs/:id': {
      authorize(ctx, 'settings.programs.delete');
      const id = (args.id ?? args.programId) as string;
      await Program.findOneAndUpdate({ tenantId, _id: id }, { $set: { isActive: false } });
      return true;
    }

    default:
      return undefined;
  }
}
