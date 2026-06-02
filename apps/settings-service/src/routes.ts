import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { handleTenants } from './use-cases/tenants';
import { handleOnboarding } from './use-cases/onboarding';
import { handleTenantUsers } from './use-cases/tenant-users';
import { handleCampuses } from './use-cases/campuses';
import { handlePrograms } from './use-cases/programs';
import { handleAcademicYears } from './use-cases/academic-years';
import { handleTemplates } from './use-cases/templates';
import { handleFeatures } from './use-cases/features';
import { handleDashboard } from './use-cases/dashboard';
import { handleAuditLogs } from './use-cases/audit-logs';

export async function handleSettingsRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  const resolvers = [
    () => handleTenants(operation, args, ctx, tenantId),
    () => handleOnboarding(operation, args, ctx, tenantId),
    () => handleTenantUsers(operation, args, ctx, tenantId),
    () => handleCampuses(operation, args, ctx, tenantId),
    () => handlePrograms(operation, args, ctx, tenantId),
    () => handleAcademicYears(operation, args, ctx, tenantId),
    () => handleTemplates(operation, args, ctx, tenantId),
    () => handleFeatures(operation, args, ctx, tenantId),
    () => handleDashboard(operation, args, ctx, tenantId),
    () => handleAuditLogs(operation, args, ctx, tenantId),
  ];

  for (const fn of resolvers) {
    const result = await fn();
    if (result !== undefined) return result;
  }

  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
