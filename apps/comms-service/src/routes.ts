import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { handleAnnouncements } from './use-cases/announcements';
import { handleEvents } from './use-cases/events';
import { handleLeaveRequests } from './use-cases/leave-requests';

export async function handleCommsRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  for (const fn of [
    () => handleAnnouncements(operation, args, ctx, tenantId),
    () => handleEvents(operation, args, ctx, tenantId),
    () => handleLeaveRequests(operation, args, ctx, tenantId),
  ]) {
    const result = await fn();
    if (result !== undefined) return result;
  }
  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
