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

import { resolveClasses }         from './resolvers/classes';
import { resolveSections }        from './resolvers/sections';
import { resolveSubjects }        from './resolvers/subjects';
import { resolveStudents }        from './resolvers/students';
import { resolveAttendance }      from './resolvers/attendance';
import { resolveExams }           from './resolvers/exams';
import { resolveTimetable }       from './resolvers/timetable';
import { resolveCertificates }    from './resolvers/certificates';
import { resolveAcademicNumbers } from './resolvers/academicNumbers';
import { resolvePromotions }      from './resolvers/promotions';

const RESOLVERS = [
  resolvePromotions,
  resolveAcademicNumbers,
  resolveClasses,
  resolveSections,
  resolveSubjects,
  resolveStudents,
  resolveAttendance,
  resolveExams,
  resolveTimetable,
  resolveCertificates,
];

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

    for (const resolve of RESOLVERS) {
      const result = await resolve(operation, args, ctx, tenantId);
      if (result !== undefined) return result;
    }

    throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
  } catch (err) {
    if (isAppError(err)) throw err;
    console.error('[academics-service]', err);
    throw new AppError('INTERNAL', 'Unexpected error in academics-service');
  }
};
