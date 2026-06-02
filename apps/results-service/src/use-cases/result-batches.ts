import { PublishedResultBatch } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../results-utils';

export async function handleResultBatches(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listResultBatches':
    case 'GET:/api/admin/results': {
      authorize(ctx, 'academics.results.read');
      const filter: Record<string, unknown> = { tenantId };
      if (args.status) filter.status = args.status;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.examId) filter.examId = args.examId;
      const docs = await PublishedResultBatch.find(filter).sort({ createdAt: -1 }).lean();
      return docs.map(d => toGql(d));
    }
    case 'getResultBatch':
    case 'GET:/api/admin/results/:id':
      authorize(ctx, 'academics.results.read');
      return toGql(await PublishedResultBatch.findOne({ tenantId, _id: args.id as string }).lean());
    case 'createResultBatch':
    case 'POST:/api/admin/results': {
      authorize(ctx, 'academics.results.create');
      const input = args.input as Record<string, unknown> ?? args;
      const doc = await PublishedResultBatch.create({
        ...input,
        tenantId,
        campusId: input.campusId ?? ctx.membership!.campusIds[0],
        createdBy: ctx.membership!.profileId,
        status: 'DRAFT',
      });
      return toGql(doc.toObject());
    }
    case 'updateResultBatch':
    case 'PATCH:/api/admin/results/:id': {
      authorize(ctx, 'academics.results.update');
      const { id, input: batchInput, ...restBatch } = args as Record<string, unknown>;
      const update = (batchInput as Record<string, unknown>) ?? restBatch;
      const batch = await PublishedResultBatch.findOne({ tenantId, _id: id as string });
      if (!batch) throw new AppError('NOT_FOUND', 'Result batch not found');
      if (batch.status === 'PUBLISHED') throw new AppError('BAD_REQUEST', 'Cannot edit a published result batch. Archive it first.');
      return toGql(await PublishedResultBatch.findOneAndUpdate({ tenantId, _id: id as string }, { $set: update }, { new: true }).lean());
    }
    case 'deleteResultBatch':
    case 'DELETE:/api/admin/results/:id': {
      authorize(ctx, 'academics.results.delete');
      const batch = await PublishedResultBatch.findOne({ tenantId, _id: args.id as string });
      if (!batch) throw new AppError('NOT_FOUND', 'Result batch not found');
      if (batch.status === 'PUBLISHED') throw new AppError('BAD_REQUEST', 'Cannot delete a published batch. Archive it first.');
      return toGql(await PublishedResultBatch.findOneAndDelete({ tenantId, _id: args.id as string }).lean());
    }
    case 'getResultPublicToken':
    case 'GET:/api/admin/results/:id/token': {
      authorize(ctx, 'academics.results.read');
      const batch = await PublishedResultBatch.findOne({ tenantId, _id: args.id as string }, 'publicToken title status').lean();
      if (!batch) throw new AppError('NOT_FOUND', 'Result batch not found');
      const publicUrl = `${process.env.APP_BASE_URL?.replace(/\/$/, '') || 'https://app.vebgenix.com'}/results/${(batch as Record<string, unknown>).publicToken}`;
      return { publicToken: (batch as Record<string, unknown>).publicToken, publicUrl };
    }
    default:
      return undefined;
  }
}
