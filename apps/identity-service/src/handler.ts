/**
 * Identity Service Lambda
 *
 * Handles identity user, staff, employee, profile, roles, campus access,
 * invite, upload-key, and impersonation flows.
 */
import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { handleIdentityRoute } from './routes';

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string'
    ? JSON.parse(event.body || '{}')
    : (event.body ?? {}) as Record<string, unknown>;
  const params = (event.pathParameters ?? {}) as Record<string, string>;
  const qs     = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const headerTenantId = (event.request as Record<string, Record<string, string>> | undefined)
      ?.headers?.['x-tenant-id'] ?? '';
    const resolveTenantId = (): string =>
      (ctx.isPlatformAdmin && headerTenantId) ? headerTenantId : getTenantId(ctx);
    return handleIdentityRoute(operation, args, ctx, resolveTenantId);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[identity-service] unhandled error:', err);
    throw new AppError('INTERNAL', 'Unexpected error in identity-service');
  }
};
