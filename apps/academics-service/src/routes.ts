import type { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';

import { handleClasses } from './use-cases/classes';
import { handleSections } from './use-cases/sections';
import { handleSubjects } from './use-cases/subjects';
import { handleStudents } from './use-cases/students';
import { handleAttendance } from './use-cases/attendance';
import { handleExams } from './use-cases/exams';
import { handleTimetable } from './use-cases/timetable';
import { handleCertificates } from './use-cases/certificates';
import { handleAcademicNumbers } from './use-cases/academic-numbers';
import { handlePromotions } from './use-cases/promotions';

const RESOLVERS = [
  handlePromotions,
  handleAcademicNumbers,
  handleClasses,
  handleSections,
  handleSubjects,
  handleStudents,
  handleAttendance,
  handleExams,
  handleTimetable,
  handleCertificates,
];

export async function handleAcademicsRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  for (const resolve of RESOLVERS) {
    const result = await resolve(operation, args, ctx, tenantId);
    if (result !== undefined) return result;
  }

  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
