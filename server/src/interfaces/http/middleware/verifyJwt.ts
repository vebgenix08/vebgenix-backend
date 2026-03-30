import { Request, Response, NextFunction } from "express";
import {
  extractBearerToken,
  getClaimString,
  getClaimStringArray,
  verifyCognitoIdToken,
} from "../auth/cognito";

/**
 * verifyJwt — Step 1 of auth chain
 *
 * ONLY verifies token signature + expiry.
 * Sets req.auth with decoded claims.
 * Does NOT touch req.user or req.tenant.
 */
export const verifyJwt = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing Authorization header" },
    });
  }

  try {
    const claims = await verifyCognitoIdToken(token);
    (req as any).auth = {
      userId: getClaimString(claims, "sub"),
      email: getClaimString(claims, "email"),
      tenantId:
        getClaimString(claims, "custom:tenant_id", "tenant_id") ??
        ((req.headers["x-tenant-id"] as string) || null),
      tenantRole: getClaimString(claims, "custom:role", "tenant_role"),
      globalRoles: getClaimStringArray(claims, "cognito:groups"),
      primaryProfileId: getClaimString(claims, "sub"),
      campusScope: getClaimString(
        claims,
        "custom:campus_scope",
        "campus_scope",
      ),
      claims,
    };

    return next();
  } catch {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
};
