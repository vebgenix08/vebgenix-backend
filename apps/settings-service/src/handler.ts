/**
 * Settings Service Lambda
 * Handles: tenants, campuses, programs, academic years, templates,
 *          tenant features/flags, dashboard stats, audit logs.
 * Multiple AppSync datasources point here — operation is identified by event.info.fieldName.
 */
import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';

import { handleTenants }       from './operations/tenants';
import { handleOnboarding }    from './operations/onboarding';
import { handleCampuses }      from './operations/campuses';
import { handlePrograms }      from './operations/programs';
import { handleAcademicYears } from './operations/academicYears';
import { handleTemplates }     from './operations/templates';
import { handleFeatures }      from './operations/features';
import { handleDashboard }     from './operations/dashboard';
import { handleAuditLogs }     from './operations/auditLogs';


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

    const resolvers = [
      () => handleTenants(operation, args, ctx, tenantId),
      () => handleOnboarding(operation, args, ctx, tenantId),
      () => handleCampuses(operation, args, ctx, tenantId),
      () => handlePrograms(operation, args, ctx, tenantId),
      () => handleAcademicYears(operation, args, ctx, tenantId),
      () => handleTemplates(operation, args, ctx, tenantId),
      () => handleFeatures(operation, args, ctx, tenantId),
      () => handleDashboard(operation, args, ctx, tenantId),
      () => handleAuditLogs(operation, args, ctx, tenantId),
    ];

    for (const fn of resolvers) {
      const result = await fn();
      if (result !== undefined) return result;
    }

    throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[settings-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
