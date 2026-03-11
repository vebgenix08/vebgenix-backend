"use strict";

/**
 * AppSync Lambda Authorizer
 *
 * Validates the custom Express-issued JWT (signed with JWT_SECRET).
 * Called by AppSync for every request using the LAMBDA auth mode.
 *
 * Event shape:
 *   { authorizationToken: "Bearer <jwt>", requestContext: { apiId, accountId, ... } }
 *
 * Return shape:
 *   { isAuthorized: boolean, resolverContext: { userId, email, global_roles, tenant_id, tenant_role } }
 */

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
// Cache TTL (must match resultsTtlInSeconds in CDK, default 300s)
// Within the TTL window AppSync re-uses the cached result without re-invoking Lambda

exports.handler = async (event) => {
  console.log("AppSync Authorizer event:", JSON.stringify(event));

  const authHeader = event.authorizationToken || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    console.warn("No token provided");
    return { isAuthorized: false };
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Build a flat resolverContext that resolver Lambdas can read via
    // event.identity.resolverContext (when auth mode is LAMBDA)
    const resolverContext = {
      userId: payload.sub || "",
      email: payload.email || "",
      global_roles: JSON.stringify(payload.global_roles || []),
      tenant_id: payload.tenant_id || "",
      tenant_role: payload.tenant_role || "",
      primary_profile_id: payload.primary_profile_id || "",
    };

    console.log("Auth success for:", payload.email);

    return {
      isAuthorized: true,
      resolverContext,
      // Optional: deny specific fields (leave empty to allow all)
      deniedFields: [],
    };
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return { isAuthorized: false };
  }
};
