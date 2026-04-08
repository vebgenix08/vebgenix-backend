'use strict';

/**
 * Shared identity helper for AppSync resolvers.
 *
 * AppSync is configured with AMAZON_COGNITO_USER_POOLS as the default auth.
 * The Cognito Pre-Token Generation trigger populates:
 *   claims["custom:global_roles"]  — JSON array
 *   claims["custom:tenant_id"]     — UUID string
 *   claims["custom:role"]          — role string
 *
 * identity.claims is always present for authenticated requests.
 */
function extractIdentity(identity) {
  const claims = identity?.claims ?? {};

  const userId    = claims.sub    ?? '';
  const email     = claims.email  ?? '';
  const tenantId  = claims['custom:tenant_id'] ?? '';
  const tenantRole = claims['custom:role']      ?? '';

  // Global roles injected by pre-token-generation trigger
  let globalRoles = [];
  try {
    const raw = claims['custom:global_roles'];
    if (raw) globalRoles = JSON.parse(raw);
  } catch (_) {
    globalRoles = [];
  }

  // Also honour Cognito Groups (fallback for super admins added via console)
  const cognitoGroups = claims['cognito:groups'] ?? [];
  const allRoles = [...new Set([...globalRoles, ...cognitoGroups])];

  const isSuperAdmin = allRoles.some(
    (r) => r === 'PLATFORM_SUPER_ADMIN' || r === 'SUPER_ADMIN'
  );

  return {
    userId,
    email,
    tenantId,
    tenantRole,
    globalRoles: allRoles,
    isSuperAdmin,
  };
}

module.exports = { extractIdentity };
