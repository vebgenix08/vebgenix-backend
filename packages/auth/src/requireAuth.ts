import type { Request, Response, NextFunction } from 'express';
import { isAppError } from '@vebgenix/errors';
import { verifyCognitoToken, extractBearerToken } from './verifyJwt';
import { buildAuthContext, CognitoIdentityClaims } from './buildContext';

declare global {
  namespace Express {
    interface Request {
      ctx: import('./AuthContext').AuthContext;
    }
  }
}

// ── EC2 REST server middleware ────────────────────────────────────────────────
// The EC2 server receives requests from clients with a Cognito Access Token in
// the Authorization header. We verify it using JWKS (RS256) then build the context.

/** Verifies Cognito token and attaches AuthContext to req.ctx */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token    = extractBearerToken(req.headers.authorization);
    const claims   = await verifyCognitoToken(token);
    const tenantId = (req.headers['x-tenant-id'] as string | undefined)
      ?? (req.params as Record<string, string>).tenantId;
    req.ctx = await buildAuthContext(claims as CognitoIdentityClaims, tenantId);
    next();
  } catch (err) {
    if (isAppError(err)) { res.status(err.statusCode).json(err.toJSON()); }
    else { res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication failed' }); }
  }
}

/** Platform-admin-only version of requireAuth */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token  = extractBearerToken(req.headers.authorization);
    const claims = await verifyCognitoToken(token);
    const ctx    = await buildAuthContext(claims as CognitoIdentityClaims);
    if (!ctx.isPlatformAdmin) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Platform admin access required' });
      return;
    }
    req.ctx = ctx;
    next();
  } catch (err) {
    if (isAppError(err)) { res.status(err.statusCode).json(err.toJSON()); }
    else { res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication failed' }); }
  }
}

// ── Lambda resolver helper ────────────────────────────────────────────────────
/**
 * resolveContext — builds AuthContext for a Lambda invocation.
 *
 * Path A — AppSync (Cognito User Pool authorizer):
 *   AppSync verifies the Cognito JWT before calling the resolver.
 *   The verified claims live in event.identity.claims — we trust them directly.
 *   No token re-verification is needed (and no JWT_SECRET exists).
 *
 * Path B — Direct API Gateway invocation or EC2 proxy:
 *   Caller must send a valid Cognito Access Token in the Authorization header.
 *   We verify it against the Cognito JWKS endpoint.
 */
export async function resolveContext(event: Record<string, unknown>) {
  // ── Path A: AppSync ──────────────────────────────────────────────
  const identity = event.identity as Record<string, unknown> | null | undefined;
  if (identity && identity.claims) {
    const claims   = identity.claims as CognitoIdentityClaims;
    const tenantId =
      (event.request as Record<string, Record<string, string>> | undefined)
        ?.headers?.['x-tenant-id']
      ?? claims['custom:tenantId'];
    return buildAuthContext(claims, tenantId);
  }

  // ── Path B: API Gateway / internal ──────────────────────────────
  const headers  = (event.headers as Record<string, string>) ?? {};
  const token    = extractBearerToken(headers['authorization'] ?? headers['Authorization']);
  const claims   = await verifyCognitoToken(token);
  const tenantId = headers['x-tenant-id']
    ?? (event.pathParameters as Record<string, string> | undefined)?.tenantId;
  return buildAuthContext(claims as CognitoIdentityClaims, tenantId);
}
