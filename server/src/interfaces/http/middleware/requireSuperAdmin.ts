import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import prisma from "../../../infrastructure/prisma/client";

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
    // 1. Verify token with Cognito JWT Verifier
    let payload;
    try {
      const verifier = CognitoJwtVerifier.create({
        userPoolId: process.env.COGNITO_USER_POOL_ID!,
        tokenUse: "id", // Use ID token to read email
        clientId: process.env.COGNITO_CLIENT_ID!,
      });
      payload = await verifier.verify(token);
    } catch (error) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const email = payload.email?.toString();

    if (!email) {
      return res
        .status(401)
        .json({ error: "Token valid but no email claim found" });
    }

    // 2. Verify Platform User (Super Admin)
    const platformRows: any[] = await prisma.$queryRaw`
       SELECT id, email, role, is_active 
       FROM platform_users 
       WHERE email = ${email}
    `;

    const platformUser =
      Array.isArray(platformRows) && platformRows.length > 0
        ? platformRows[0]
        : null;

    if (
      !platformUser ||
      platformUser.role !== "SUPER_ADMIN" ||
      !platformUser.is_active
    ) {
      console.warn(`Unauthorized platform access attempt by email: ${email}`);
      return res
        .status(403)
        .json({ error: "Forbidden: Super Admin access required" });
    }

    // 3. Attach to request
    req.platformUser = {
      id: platformUser.id,
      email: platformUser.email,
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
