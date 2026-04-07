import jwt from "jsonwebtoken";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

let idVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;
let accessVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

if (process.env.USER_POOL_ID && process.env.USER_POOL_CLIENT_ID) {
  const config = {
    userPoolId: process.env.USER_POOL_ID,
    clientId: process.env.USER_POOL_CLIENT_ID,
  };

  idVerifier = CognitoJwtVerifier.create({
    ...config,
    tokenUse: "id",
  });
  accessVerifier = CognitoJwtVerifier.create({
    ...config,
    tokenUse: "access",
  });
}

export interface VerifiedAuthClaims {
  sub: string;
  email?: string;
  tenantId: string | null;
  tenantRole: string | null;
  primaryProfileId: string | null;
  campusScope: string | null;
  globalRoles: string[];
  raw: Record<string, any>;
}

export function getBearerToken(authorization?: string | null): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function normalizeClaims(payload: Record<string, any>): VerifiedAuthClaims {
  const cognitoGroups = Array.isArray(payload["cognito:groups"])
    ? payload["cognito:groups"].map(String)
    : typeof payload["cognito:groups"] === "string"
      ? [payload["cognito:groups"]]
      : [];

  return {
    sub: String(payload.sub),
    email:
      typeof payload.email === "string"
        ? payload.email
        : typeof payload["cognito:username"] === "string"
          ? payload["cognito:username"]
          : typeof payload.username === "string"
            ? payload.username
            : undefined,
    tenantId:
      typeof payload.tenant_id === "string"
        ? payload.tenant_id
        : typeof payload["custom:tenant_id"] === "string"
          ? payload["custom:tenant_id"]
          : null,
    tenantRole:
      typeof payload.tenant_role === "string"
        ? payload.tenant_role
        : typeof payload["custom:role"] === "string"
          ? payload["custom:role"]
          : null,
    primaryProfileId:
      typeof payload.primary_profile_id === "string"
        ? payload.primary_profile_id
        : typeof payload["custom:primary_profile_id"] === "string"
          ? payload["custom:primary_profile_id"]
        : null,
    campusScope:
      typeof payload.campus_scope === "string"
        ? payload.campus_scope
        : typeof payload["custom:campus_scope"] === "string"
          ? payload["custom:campus_scope"]
          : null,
    globalRoles: Array.isArray(payload.global_roles)
      ? payload.global_roles.map(String)
      : cognitoGroups.length > 0
        ? cognitoGroups
      : [],
    raw: payload,
  };
}

export async function verifyRequestToken(token: string): Promise<VerifiedAuthClaims> {
  let payload: Record<string, any> | null = null;

  if (idVerifier) {
    try {
      payload = (await idVerifier.verify(token)) as Record<string, any>;
    } catch {
      payload = null;
    }
  }

  if (!payload && accessVerifier) {
    try {
      payload = (await accessVerifier.verify(token)) as Record<string, any>;
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    payload = jwt.verify(token, JWT_SECRET) as Record<string, any>;
  }

  if (!payload?.sub) {
    throw new Error("Invalid token payload");
  }

  return normalizeClaims(payload);
}
