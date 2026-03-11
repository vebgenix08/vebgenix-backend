import { IdentityService } from '../../domain/identity/services';

export async function resolveContext(identity: any) {
  if (!identity) {
    throw new Error('Unauthorized: No identity context');
  }

  // Cognito User Pool Identity
  const userId = identity.sub;
  const tenantId = identity.claims?.['custom:tenant_id'];

  if (!userId) {
    throw new Error('Unauthorized: Invalid identity structure');
  }

  return IdentityService.getContext(userId, tenantId);
}
