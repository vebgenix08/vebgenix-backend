import { authorize } from '@vebgenix/permissions';
import { AcademicsRepo } from '@vebgenix/db';
import type { AuthContext } from '@vebgenix/auth';
import { GenerateRegistrationNumbers } from '../use-cases/GenerateRegistrationNumbers';
import { FreezeRegistrationNumbers } from '../use-cases/FreezeRegistrationNumbers';
import { GenerateRollNumbers } from '../use-cases/GenerateRollNumbers';
import { FreezeRollNumbers } from '../use-cases/FreezeRollNumbers';
import { AssignStudentToSection } from '../use-cases/AssignStudentToSection';
import { TransferStudentSection } from '../use-cases/TransferStudentSection';

export async function resolveAcademicNumbers(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    // ── Enrollment ──────────────────────────────────────────────────────────────

    case 'assignStudentToSection':
    case 'POST:/api/admin/academics/enrollments': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof AssignStudentToSection.execute>[1];
      return AssignStudentToSection.execute(ctx, input);
    }

    case 'transferStudentSection':
    case 'POST:/api/admin/academics/enrollments/transfer': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof TransferStudentSection.execute>[1];
      return TransferStudentSection.execute(ctx, input);
    }

    case 'listEnrollments':
    case 'GET:/api/admin/academics/enrollments': {
      authorize(ctx, 'academics.enrollment.read');
      const filters: Record<string, unknown> = {};
      if (args.academicYearId) filters.academicYearId = args.academicYearId;
      if (args.campusId)       filters.campusId       = args.campusId;
      if (args.gradeId)        filters.gradeId        = args.gradeId;
      if (args.sectionId)      filters.sectionId      = args.sectionId;
      if (args.status)         filters.status         = args.status;
      return AcademicsRepo.listEnrollments(tenantId, filters);
    }

    // ── Registration Numbers ────────────────────────────────────────────────────

    case 'generateRegistrationNumbers':
    case 'POST:/api/admin/academics/registration-numbers/generate': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof GenerateRegistrationNumbers.execute>[1];
      return GenerateRegistrationNumbers.execute(ctx, input);
    }

    case 'freezeRegistrationNumbers':
    case 'POST:/api/admin/academics/registration-numbers/freeze': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof FreezeRegistrationNumbers.execute>[1];
      return FreezeRegistrationNumbers.execute(ctx, input);
    }

    case 'listRegistrationBatches':
    case 'GET:/api/admin/academics/registration-batches': {
      authorize(ctx, 'academics.registration.read');
      const filters: Record<string, unknown> = {};
      if (args.academicYearId) filters.academicYearId = args.academicYearId;
      if (args.campusId)       filters.campusId       = args.campusId;
      if (args.gradeId)        filters.gradeId        = args.gradeId;
      return AcademicsRepo.listRegistrationBatches(tenantId, filters);
    }

    // ── Roll Numbers ────────────────────────────────────────────────────────────

    case 'generateRollNumbers':
    case 'POST:/api/admin/academics/roll-numbers/generate': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof GenerateRollNumbers.execute>[1];
      return GenerateRollNumbers.execute(ctx, input);
    }

    case 'freezeRollNumbers':
    case 'POST:/api/admin/academics/roll-numbers/freeze': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as Parameters<typeof FreezeRollNumbers.execute>[1];
      return FreezeRollNumbers.execute(ctx, input);
    }

    case 'listRollNoBatches':
    case 'GET:/api/admin/academics/roll-number-batches': {
      authorize(ctx, 'academics.rollno.read');
      const filters: Record<string, unknown> = {};
      if (args.academicYearId) filters.academicYearId = args.academicYearId;
      if (args.campusId)       filters.campusId       = args.campusId;
      if (args.gradeId)        filters.gradeId        = args.gradeId;
      if (args.sectionId)      filters.sectionId      = args.sectionId;
      return AcademicsRepo.listRollNoBatches(tenantId, filters);
    }

    default:
      return undefined;
  }
}
