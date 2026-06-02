import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { handleResultsRoute } from './routes';
import { parseEvent } from './results-utils';

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const { operation, args } = parseEvent(event);
    const ctx = operation === 'GET:/api/public/results/:token' || operation === 'getPublicResult'
      ? null
      : await resolveContext(event);
    return await handleResultsRoute(operation, args, ctx ?? undefined, ctx ? getTenantId(ctx) : '');
  } catch (err) {
    if (isAppError(err)) throw err;
    console.error('[results-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
