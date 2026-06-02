import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { handleCommsRoute } from './routes';
import { parseEvent } from './comms-utils';

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const tenantId = getTenantId(ctx);
    return await handleCommsRoute(operation, args, ctx, tenantId);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[comms-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
