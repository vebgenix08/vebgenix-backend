import { Request, Response, NextFunction } from "express";
import prisma from "../../../infrastructure/prisma/client";
import {
  extractBearerToken,
  getClaimString,
  getClaimStringArray,
  verifyCognitoIdToken,
} from "../auth/cognito";

export interface PlatformUser {
  id: string;
  email: string;
  role: "SUPER_ADMIN";
}

declare global {
  namespace Express {
    interface Request {
      platformUser?: PlatformUser;
    }
  }
}

export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: "No authorization header" });
  }

  try {
    const payload = await verifyCognitoIdToken(token);
    const email = getClaimString(payload, "email");

    if (!email) {
      return res
        .status(401)
        .json({ error: "Token valid but no email claim found" });
    }

    // 2. Check if user has global PLATFORM_SUPER_ADMIN role from JWT or DB
    const isSuperAdminFromJwt = getClaimStringArray(
      payload,
      "cognito:groups",
    ).includes("PLATFORM_SUPER_ADMIN");

    // Fallback to AuthUserGlobalRole check
    let isSuperAdminFromDb = false;
    let authUserId = getClaimString(payload, "sub") ?? "";

    if (!isSuperAdminFromJwt) {
      const dbUser = await prisma.authUser.findUnique({
        where: { email },
        include: { globalRoles: true },
      });

      if (dbUser && dbUser.status === "ACTIVE") {
        isSuperAdminFromDb = dbUser.globalRoles.some(
          (gr) => gr.role === "PLATFORM_SUPER_ADMIN",
        );
        authUserId = dbUser.id;
      }
    }

    if (!isSuperAdminFromJwt && !isSuperAdminFromDb) {
      console.warn(`Unauthorized platform access attempt by email: ${email}`);
      return res
        .status(403)
        .json({ error: "Forbidden: Super Admin access required" });
    }

    // 3. Attach to request
    req.platformUser = {
      id: authUserId,
      email: email,
      role: "SUPER_ADMIN",
    };

    next();
    return;
  } catch (err) {
    console.error("Platform Auth Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
};
