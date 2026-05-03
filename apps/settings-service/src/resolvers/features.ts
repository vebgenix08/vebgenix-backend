import { TenantFeature } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveFeatures(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    case 'getTenantFeatures':
    case 'GET:/api/admin/settings/features': {
      const doc = await TenantFeature.findOne({ tenantId }).lean();
      return doc ?? { tenantId, features: {} };
    }

    case 'updateTenantFeatures':
    case 'PATCH:/api/admin/settings/features':
    case 'PATCH:/api/platform/tenants/:id/features': {
      const tid = (args.id as string) ?? tenantId;
      if (!ctx.isPlatformAdmin) authorize(ctx, 'tenant.settings.update');
      const features = (args.features as Record<string, boolean>) ?? args;
      return TenantFeature.findOneAndUpdate(
        { tenantId: tid },
        { $set: { features, updatedBy: ctx.membership?.profileId ?? ctx.userId } },
        { upsert: true, new: true },
      ).lean();
    }

    default:
      return undefined;
  }
}
