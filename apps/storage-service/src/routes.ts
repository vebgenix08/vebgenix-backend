import { AppError } from '@vebgenix/errors';
import { handleDownloads } from './use-cases/downloads';
import { handleUploads } from './use-cases/uploads';

export async function handleStorageRoute(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  for (const fn of [
    () => handleUploads(operation, args, tenantId),
    () => handleDownloads(operation, args, tenantId),
  ]) {
    const result = await fn();
    if (result !== undefined) return result;
  }
  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
