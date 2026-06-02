/**
 * Academics Service Lambda — thin router
 *
 * Handles: classes, sections, subjects, subject allocations, students,
 *          attendance, exams, results, timetable, class assignment, certificates.
 *
 * AppSync datasources: StudentsDs, AcademicsDs  (both point here — resolved by fieldName)
 */
import { bootstrapDB, ensureDB } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { handleAcademicsRoute } from './routes';

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
  return { operation: `${method}:${path}`, args: { ...body, ...params } };
}

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const ctx                  = await resolveContext(event);
    const { operation, args }  = parseEvent(event);
    const tenantId             = getTenantId(ctx);
    return handleAcademicsRoute(operation, args, ctx, tenantId);
  } catch (err) {
    if (isAppError(err)) throw err;
    console.error('[academics-service]', err);
    throw new AppError('INTERNAL', 'Unexpected error in academics-service');
  }
};
