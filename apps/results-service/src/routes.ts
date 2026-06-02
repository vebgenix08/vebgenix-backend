import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { handlePublicResults } from './use-cases/public-results';
import { handleResultBatches } from './use-cases/result-batches';
import { handleResultPublishing } from './use-cases/result-publishing';

export async function handleResultsRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx?: AuthContext,
  tenantId = '',
): Promise<unknown> {
  const publicResult = await handlePublicResults(operation, args);
  if (publicResult !== undefined) return publicResult;
  if (!ctx) throw new AppError('FORBIDDEN', 'Authentication required');

  for (const fn of [
    () => handleResultBatches(operation, args, ctx, tenantId),
    () => handleResultPublishing(operation, args, ctx, tenantId),
  ]) {
    const result = await fn();
    if (result !== undefined) return result;
  }

  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
