/**
 * Settings Service Lambda
 * Handles: tenants, campuses, programs, academic years, templates,
 *          tenant features/flags, dashboard stats, audit logs.
 * Multiple AppSync datasources point here — operation is identified by event.info.fieldName.
 */
import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';

import { resolveTenants }      from './resolvers/tenants';
import { resolveOnboarding }   from './resolvers/onboarding';
import { resolveCampuses }     from './resolvers/campuses';
import { resolvePrograms }     from './resolvers/programs';
import { resolveAcademicYears } from './resolvers/academicYears';
import { resolveTemplates }    from './resolvers/templates';
import { resolveFeatures }     from './resolvers/features';
import { resolveDashboard }    from './resolvers/dashboard';
import { resolveAuditLogs }    from './resolvers/auditLogs';


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
    // Use optional chaining to avoid throwing for platform-only operations
    const tenantId = ctx.membership?.tenantId ?? '';

    const resolvers = [
      () => resolveTenants(operation, args, ctx, tenantId),
      () => resolveOnboarding(operation, args, ctx, tenantId),
      () => resolveCampuses(operation, args, ctx, tenantId),
      () => resolvePrograms(operation, args, ctx, tenantId),
      () => resolveAcademicYears(operation, args, ctx, tenantId),
      () => resolveTemplates(operation, args, ctx, tenantId),
      () => resolveFeatures(operation, args, ctx, tenantId),
      () => resolveDashboard(operation, args, ctx, tenantId),
      () => resolveAuditLogs(operation, args, ctx, tenantId),
    ];

    for (const fn of resolvers) {
      const result = await fn();
      if (result !== undefined) return result;
    }

    throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
  } catch (err) {
    if (isAppError(err)) {
      return { __error: true, code: err.code, message: err.message, statusCode: err.statusCode };
    }
    console.error('[settings-service] unhandled error:', err);
    return { __error: true, code: 'INTERNAL', message: 'Internal server error', statusCode: 500 };
  }
};
