/**
 * Cognito JWT verification — used by the EC2 REST server only.
 *
 * AppSync Lambda resolvers do NOT need this: AppSync validates the Cognito token
 * before invoking the resolver and passes the verified identity in event.identity.
 * For those resolvers, read event.identity.claims directly (see resolveContext in requireAuth.ts).
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AppError } from '@vebgenix/errors';

// Singleton verifier — JWKS keys are cached after first use
let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (_verifier) return _verifier;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId   = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new AppError('INTERNAL', 'COGNITO_USER_POOL_ID or COGNITO_CLIENT_ID not configured');
  }
  _verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'access',   // use 'id' if your frontend sends an ID token instead
    clientId,
  });
  return _verifier;
}

export interface CognitoClaims {
  sub: string;
  email?: string;
  username?: string;
  'cognito:groups'?: string[];
  'custom:tenantId'?: string;
  [key: string]: unknown;
}

/**
 * Verify a Cognito Access Token against the User Pool's JWKS endpoint.
 * Checks RS256 signature, expiry, audience, and issuer automatically.
 */
export async function verifyCognitoToken(token: string): Promise<CognitoClaims> {
  try {
    const payload = await getVerifier().verify(token);
    return payload as unknown as CognitoClaims;
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired Cognito token');
  }
}

export function extractBearerToken(authHeader?: string): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing or malformed Authorization header');
  }
  return authHeader.slice(7);
}
