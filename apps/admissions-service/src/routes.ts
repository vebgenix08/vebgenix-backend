import type { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';
import { handleEnquiries } from './use-cases/enquiries';
import { handleApplications } from './use-cases/applications';
import { handleApplicationReview } from './use-cases/application-review';
import { handleDocuments } from './use-cases/documents';
import { handleReports } from './use-cases/reports';
import { handleAdmissionConfirmation } from './use-cases/admission-confirmation';

const RESOLVERS = [
  handleEnquiries,
  handleApplications,
  handleApplicationReview,
  handleDocuments,
  handleReports,
  handleAdmissionConfirmation,
];

export async function handleAdmissionsRoute(
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
