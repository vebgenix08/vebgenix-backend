import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../../infrastructure/prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

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
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // 1. Verify token with Local JWT
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error("Auth Error (JWT):", error);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const email = payload.email?.toString();

    if (!email) {
      return res
        .status(401)
        .json({ error: "Token valid but no email claim found" });
    }

    // 2. Check if user has global PLATFORM_SUPER_ADMIN role from JWT or DB
    const isSuperAdminFromJwt = payload.global_roles?.includes(
      "PLATFORM_SUPER_ADMIN",
    );

    // Fallback to AuthUserGlobalRole check
    let isSuperAdminFromDb = false;
    let authUserId = payload.sub;

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
