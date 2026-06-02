/**
 * Settings Service Lambda
 * Handles: tenants, campuses, programs, academic years, templates,
 *          tenant features/flags, dashboard stats, audit logs.
 * Multiple AppSync datasources point here — operation is identified by event.info.fieldName.
 */
import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { isAppError } from '@vebgenix/errors';
import { handleSettingsRoute } from './routes';


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
    // Health check — no auth, no DB needed
    const rawOp = (event.info as Record<string, string> | undefined)?.fieldName
      ?? (event.httpMethod ? `${event.httpMethod}:${event.path}` : '');
    if (rawOp === 'health' || rawOp === 'GET:/api/health') {
      return 'OK';
    }

    await ensureDB();
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    // Platform admins have no membership, so fall back to x-tenant-id header
    const tenantId = ctx.membership?.tenantId
      ?? (event.request as Record<string, Record<string, string>> | undefined)?.headers?.['x-tenant-id']
      ?? '';
    return await handleSettingsRoute(operation, args, ctx, tenantId);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[settings-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
