import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

/**
 * verifyJwt — Step 1 of auth chain
 *
 * ONLY verifies token signature + expiry.
 * Sets req.auth with decoded claims.
 * Does NOT touch req.user or req.tenant.
 */
export const verifyJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing Authorization header" },
    });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing Bearer token" },
    });
  }

  try {
    const payload: any = jwt.verify(token, JWT_SECRET);

    (req as any).auth = {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenant_id || null,
      tenantRole: payload.tenant_role || null,
      globalRoles: payload.global_roles || [],
      primaryProfileId: payload.primary_profile_id || null,
      campusScope: payload.campus_scope || null,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
};
