import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { getAvatarUploadKey, getTenantLogoUploadKey } from '../identity-utils';

export async function handleUploads(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  switch (operation) {
    case 'uploadAvatar':
    case 'POST:/api/me/avatar': {
      const key = getAvatarUploadKey(ctx.membership?.tenantId, ctx.userId);
      return {
        key,
        contentType: (args.contentType as string) ?? 'image/jpeg',
      };
    }
    case 'uploadTenantLogo':
    case 'POST:/api/admin/settings/logo': {
      authorize(ctx, 'tenant.settings.update');
      const tenantId = resolveTenantId();
      const key = getTenantLogoUploadKey(tenantId);
      return {
        key,
        contentType: (args.contentType as string) ?? 'image/png',
      };
    }
    default:
      return undefined;
  }
}
