import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { handleCleanupRoute } from './routes';
import { parseEvent } from './cleanup-utils';

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const tenantId = getTenantId(ctx);
    return await handleCleanupRoute(operation, args, ctx, tenantId);
  } catch (err) {
    if (isAppError(err)) {
      return { __error: true, code: err.code, message: err.message, statusCode: err.statusCode };
    }
    console.error('[admin-cleanup-service] unhandled error:', err);
    return { __error: true, code: 'INTERNAL', message: 'Internal server error', statusCode: 500 };
  }
};
