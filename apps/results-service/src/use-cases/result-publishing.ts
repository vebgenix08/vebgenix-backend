import { PublishedResultBatch } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../results-utils';

export async function handleResultPublishing(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'publishResultBatch':
    case 'POST:/api/admin/results/:id/publish': {
      authorize(ctx, 'academics.results.publish');
      const batch = await PublishedResultBatch.findOne({ tenantId, _id: args.id as string });
      if (!batch) throw new AppError('NOT_FOUND', 'Result batch not found');
      if (batch.status === 'PUBLISHED') throw new AppError('BAD_REQUEST', 'Already published');
      return toGql(await PublishedResultBatch.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: ctx.membership!.profileId } }, { new: true }).lean());
    }
    case 'archiveResultBatch':
    case 'POST:/api/admin/results/:id/archive': {
      authorize(ctx, 'academics.results.publish');
      return toGql(await PublishedResultBatch.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'ARCHIVED' } }, { new: true }).lean());
    }
    default:
      return undefined;
  }
}
