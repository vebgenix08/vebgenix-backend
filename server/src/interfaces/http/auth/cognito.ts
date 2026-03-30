import { CognitoJwtVerifier } from "aws-jwt-verify";

type CognitoClaims = Record<string, any>;

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getCognitoVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: getRequiredEnv("COGNITO_USER_POOL_ID"),
      tokenUse: "id",
      clientId: getRequiredEnv("COGNITO_CLIENT_ID"),
    });
  }

  return verifier;
}

export async function verifyCognitoIdToken(token: string): Promise<CognitoClaims> {
  return getCognitoVerifier().verify(token);
}

export function extractBearerToken(authorization?: string | null): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export function getClaimString(
  claims: CognitoClaims,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

export function getClaimStringArray(
  claims: CognitoClaims,
  key: string,
): string[] {
  const value = claims[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value) {
    return [value];
  }
  return [];
}
