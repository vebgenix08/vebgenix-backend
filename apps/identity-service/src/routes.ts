import type { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';
import type { ResolveTenantId } from './identity-utils';
import { handleProfile } from './use-cases/profile';
import { handleUsers } from './use-cases/users';
import { handleStaff } from './use-cases/staff';
import { handleEmployees } from './use-cases/employees';
import { handleInvites } from './use-cases/invites';
import { handleCampusAccess } from './use-cases/campus-access';
import { handleRoles } from './use-cases/roles';
import { handleImpersonation } from './use-cases/impersonation';
import { handleUploads } from './use-cases/uploads';

const RESOLVERS = [
  handleProfile,
  handleUsers,
  handleStaff,
  handleEmployees,
  handleCampusAccess,
  handleRoles,
  handleImpersonation,
  handleUploads,
  handleInvites,
];

export async function handleIdentityRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  for (const resolve of RESOLVERS) {
    const result = await resolve(operation, args, ctx, resolveTenantId);
    if (result !== undefined) return result;
  }
  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
