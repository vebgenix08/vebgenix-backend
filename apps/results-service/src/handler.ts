/**
 * Results Service Lambda
 *
 * Handles: PublishedResultBatch — create, list, update, delete, publish, archive.
 *          Public result lookup by token (no auth required).
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer)
 *   - API Gateway REST (admin)
 *   - API Gateway REST PUBLIC — /api/public/results/:token — no auth
 */
import { bootstrapDB, ensureDB, PublishedResultBatch } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params  = (event.pathParameters ?? {}) as Record<string, string>;
  const qs      = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();

    const { operation, args } = parseEvent(event);

    // ── Public result lookup — no auth ───────────────────────────────────────
    if (
      operation === 'GET:/api/public/results/:token' ||
      operation === 'getPublicResult'
    ) {
      const token  = (args.token ?? args.publicToken) as string;
      if (!token) throw new AppError('BAD_REQUEST', 'Token is required');
      const batch  = await PublishedResultBatch.findOne({ publicToken: token, status: 'PUBLISHED' }).lean();
      if (!batch) throw new AppError('NOT_FOUND', 'Result not found or not published');
      return toGql(batch);
    }

    // ── All other routes require auth ────────────────────────────────────────
    const ctx      = await resolveContext(event);
    const tenantId = getTenantId(ctx);

    switch (operation) {

      case 'listResultBatches':
      case 'GET:/api/admin/results': {
        authorize(ctx, 'academics.results.read');
        const filter: Record<string, unknown> = { tenantId };
        if (args.status)         filter.status         = args.status;
        if (args.academicYearId) filter.academicYearId = args.academicYearId;
        if (args.examId)         filter.examId         = args.examId;
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
          campusId:       input.campusId ?? ctx.membership!.campusIds[0],
          createdBy:      ctx.membership!.profileId,
          status:         'DRAFT',
        });
        return toGql(doc.toObject());
      }

      case 'updateResultBatch':
      case 'PATCH:/api/admin/results/:id': {
        authorize(ctx, 'academics.results.update');
        const { id, ...update } = args as Record<string, unknown>;
        const batch = await PublishedResultBatch.findOne({ tenantId, _id: id as string });
        if (!batch) throw new AppError('NOT_FOUND', 'Result batch not found');
        if (batch.status === 'PUBLISHED') throw new AppError('BAD_REQUEST', 'Cannot edit a published result batch. Archive it first.');
        return toGql(await PublishedResultBatch.findOneAndUpdate(
          { tenantId, _id: id as string },
          { $set: update },
          { new: true }
        ).lean());
      }

      case 'publishResultBatch':
      case 'POST:/api/admin/results/:id/publish': {
        authorize(ctx, 'academics.results.publish');
        const batch = await PublishedResultBatch.findOne({ tenantId, _id: args.id as string });
        if (!batch) throw new AppError('NOT_FOUND', 'Result batch not found');
        if (batch.status === 'PUBLISHED') throw new AppError('BAD_REQUEST', 'Already published');
        return toGql(await PublishedResultBatch.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: ctx.membership!.profileId } },
          { new: true }
        ).lean());
      }

      case 'archiveResultBatch':
      case 'POST:/api/admin/results/:id/archive': {
        authorize(ctx, 'academics.results.publish');
        return toGql(await PublishedResultBatch.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: { status: 'ARCHIVED' } },
          { new: true }
        ).lean());
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
        const publicUrl = `${process.env.APP_BASE_URL ?? ''}/results/${(batch as Record<string, unknown>).publicToken}`;
        return { publicToken: (batch as Record<string, unknown>).publicToken, publicUrl };
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[results-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
