import { Tenant, TenantFeature } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveTenants(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'listTenants':
    case 'GET:/api/platform/tenants': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const filter: Record<string, unknown> = {};
      if (args.isActive !== undefined) filter.isActive = args.isActive === 'true' || args.isActive === true;
      return Tenant.find(filter).sort({ name: 1 }).lean();
    }

    case 'getTenant':
    case 'GET:/api/platform/tenants/:id': {
      const id = (args.tenantId ?? args.id) as string;
      if (!ctx.isPlatformAdmin && id !== tenantId) {
        throw new AppError('FORBIDDEN', 'Cannot view another tenant');
      }
      return Tenant.findById(id).lean();
    }

    case 'createTenant':
    case 'POST:/api/platform/tenants': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const input  = (args.input as Record<string, unknown>) ?? args;
      const tenant = await Tenant.create({ ...input, isActive: true });
      await TenantFeature.create({ tenantId: tenant._id.toString() });
      return tenant;
    }

    case 'updateTenant':
    case 'PATCH:/api/platform/tenants/:id':
    case 'PATCH:/api/admin/settings/tenant': {
      const id               = (args.tenantId ?? args.id) as string | undefined;
      const resolvedTenantId = id ?? tenantId;
      if (!ctx.isPlatformAdmin) authorize(ctx, 'tenant.settings.update');
      const input = (args.input as Record<string, unknown>) ?? args;
      const { isActive: _ia, slug: _sl, ...safeInput } = input as Record<string, unknown>;
      return Tenant.findByIdAndUpdate(resolvedTenantId, { $set: safeInput }, { new: true }).lean();
    }

    case 'deactivateTenant':
    case 'DELETE:/api/platform/tenants/:id': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.tenantId ?? args.id) as string;
      return Tenant.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    }

    default:
      return undefined;
  }
}
