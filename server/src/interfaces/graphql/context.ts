import { IdentityService } from '../../domain/identity/services';

export async function resolveContext(identity: any, headers?: any) {
  if (!identity) {
    throw new Error('Unauthorized: No identity context');
  }

  // Cognito User Pool Identity
  const userId = identity.sub;
  
  // Tenant Resolution Strategy:
  // 1. Header 'x-tenant-id' (Dynamic Switching - Preferred)
  // 2. Custom Claim 'custom:tenant_id' (Fallback/Legacy)
  const tenantId = headers?.['x-tenant-id'] || identity.claims?.['custom:tenant_id'];

  if (!userId) {
    throw new Error('Unauthorized: Invalid identity structure');
  }

  return IdentityService.getContext(userId, tenantId);
}
