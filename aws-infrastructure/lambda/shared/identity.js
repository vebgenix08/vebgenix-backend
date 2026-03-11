"use strict";

/**
 * Shared identity helper for AppSync resolvers.
 *
 * Supports both auth modes:
 *   USER_POOL  → identity.claims      (Cognito JWT)
 *   LAMBDA     → identity.resolverContext  (Express JWT via appsync-authorizer)
 */
function extractIdentity(identity) {
  const isLambdaAuth = !!identity?.resolverContext;
  const claims = identity?.claims || {};
  const rc = identity?.resolverContext || {};

  const userId = isLambdaAuth ? rc.userId : claims.sub;
  const email = isLambdaAuth ? rc.email : claims.email;
  const tenantId = isLambdaAuth ? rc.tenant_id : claims["custom:tenant_id"];
  const tenantRole = isLambdaAuth ? rc.tenant_role : null;
  const primaryProfileId = isLambdaAuth ? rc.primary_profile_id : null;

  // Parse global roles
  let globalRoles = [];
  if (isLambdaAuth) {
    try {
      globalRoles = JSON.parse(rc.global_roles || "[]");
    } catch (_) {
      globalRoles = [];
    }
  } else {
    globalRoles = claims["cognito:groups"] || [];
  }

  // Unified super admin check (covers both naming conventions)
  const isSuperAdmin =
    globalRoles.includes("PLATFORM_SUPER_ADMIN") ||
    globalRoles.includes("SUPER_ADMIN");

  return {
    userId,
    email,
    tenantId,
    tenantRole,
    primaryProfileId,
    globalRoles,
    isSuperAdmin,
    isLambdaAuth,
  };
}

module.exports = { extractIdentity };
