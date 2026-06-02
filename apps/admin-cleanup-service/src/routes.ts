import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { handleDuplicateReports } from './use-cases/duplicate-reports';
import { handleMergeRecords } from './use-cases/merge-records';
import { handleCleanupRecords } from './use-cases/cleanup-records';

export async function handleCleanupRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  for (const fn of [
    () => handleDuplicateReports(operation, ctx, tenantId),
    () => handleMergeRecords(operation, args, ctx, tenantId),
    () => handleCleanupRecords(operation, args, ctx, tenantId),
  ]) {
    const result = await fn();
    if (result !== undefined) return result;
  }
  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
