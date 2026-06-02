import { resolveContext } from '@vebgenix/auth';
import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { handleStorageRoute } from './routes';
import { parseEvent } from './storage-utils';

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const tenantId = getTenantId(ctx);
    return await handleStorageRoute(operation, args, tenantId);
  } catch (err) {
    if (isAppError(err)) throw err;
    console.error('[storage-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
