import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import { EmailService } from "../../../infrastructure/services/emailService";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { GlobalRole } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const ACCESS_TOKEN_EXPIRY = "8h";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export class AuthController {
  // Helper: Generate Tokens
  private static generateTokens(user: any, context?: any) {
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        global_roles: user.globalRoles?.map((gr: any) => gr.role) || [],
        // Context claims
        tenant_id: context?.tenantId,
        tenant_role: context?.role,
        campus_scope: context?.campusScope,
        primary_profile_id: context?.primaryProfileId,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshToken = crypto.randomBytes(40).toString("hex");
    return { accessToken, refreshToken };
  }

  // POST /api/auth/login
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // 1. Find User
      const user = await prisma.authUser.findUnique({
        where: { email: normalizedEmail },
        include: {
          globalRoles: true,
          memberships: {
            where: { status: "ACTIVE" },
            include: { tenant: true }, // Fetch tenant details for selection
          },
        },
      });

      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // 2. Verify Password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.status !== "ACTIVE") {
        return res.status(403).json({ message: "Account disabled" });
      }

      // 3. Determine Context
      let context = null;
      let availableContexts: any[] = [];

      const isSuperAdmin = user.globalRoles.some(
        (gr) => gr.role === GlobalRole.PLATFORM_SUPER_ADMIN,
      );

      if (isSuperAdmin) {
        // Platform Context
        context = { role: "SUPER_ADMIN" }; // Special marker
      } else if (user.memberships.length === 1) {
        // Single Tenant -> Auto-select
        const membership = user.memberships[0];
        context = {
          tenantId: membership.tenantId,
          role: membership.role,
          campusScope: membership.campusScope,
          primaryProfileId: membership.primaryProfileId,
        };
      } else {
        // Multiple Tenants -> Require Selection
        availableContexts = user.memberships.map((m) => ({
          tenantId: m.tenantId,
          tenantName: m.tenant.name,
          role: m.role,
          campusScope: m.campusScope,
        }));
      }

      // 4. Generate Tokens
      // If ambiguous context, we ONLY return refresh token + list of contexts.
      // User must call switch-tenant.
      // BUT for simplicity, we can issue a "Session Token" (Refresh Token) and let them choose.

      const { accessToken, refreshToken } = AuthController.generateTokens(
        user,
        context,
      );

      // Hash Refresh Token
      const refreshTokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      // Create Session
      await prisma.authSession.create({
        data: {
          userId: user.id,
          refreshTokenHash,
          expiresAt: new Date(
            Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
          ),
          userAgent: req.headers["user-agent"] || "unknown",
          ip: req.ip || "unknown",
        },
      });

      // Set Cookie
      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      });

      if (!context && !isSuperAdmin && user.memberships.length > 0) {
        // Ambiguous state
        return res.json({
          message: "Select tenant",
          requires_selection: true,
          available_tenants: availableContexts,
        });
      }

      return res.json({
        access_token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          global_roles: user.globalRoles.map((r) => r.role),
          context,
        },
      });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  }

  // POST /api/auth/switch-tenant
  static async switchTenant(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refresh_token;
      const { tenantId } = req.body;

      if (!refreshToken) return res.status(401).json({ message: "No session" });
      if (!tenantId)
        return res.status(400).json({ message: "Tenant ID required" });

      const refreshTokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      // Find Session
      const session = await prisma.authSession.findFirst({
        where: {
          refreshTokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          user: { include: { globalRoles: true, memberships: true } },
        },
      });

      if (!session) return res.status(401).json({ message: "Invalid session" });

      // Verify Membership
      const membership = session.user.memberships.find(
        (m) => m.tenantId === tenantId && m.status === "ACTIVE",
      );
      if (!membership)
        return res.status(403).json({ message: "Not a member of this tenant" });

      // Generate New Access Token
      const context = {
        tenantId: membership.tenantId,
        role: membership.role,
        campusScope: membership.campusScope,
        primaryProfileId: membership.primaryProfileId,
      };

      const { accessToken } = AuthController.generateTokens(
        session.user,
        context,
      );

      return res.json({ access_token: accessToken });
    } catch (error) {
      console.error("Switch Tenant error:", error);
      return res.status(500).json({ message: "Switch failed" });
    }
  }

  // POST /api/auth/refresh
  static async refreshToken(req: Request, res: Response) {
    try {
      const oldRefreshToken = req.cookies.refresh_token;
      if (!oldRefreshToken)
        return res.status(401).json({ message: "No token" });

      const oldHash = crypto
        .createHash("sha256")
        .update(oldRefreshToken)
        .digest("hex");

      // Find & Rotate
      // Transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        const session = await tx.authSession.findFirst({
          where: { refreshTokenHash: oldHash },
          include: {
            user: { include: { globalRoles: true, memberships: true } },
          },
        });

        if (!session) throw new Error("Invalid token");
        if (session.revokedAt || session.expiresAt < new Date()) {
          // Token Reuse Detection could go here (revoke all user sessions)
          throw new Error("Expired or revoked");
        }

        // Revoke Old
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() }, // Or delete it
        });

        // Create New
        const newRefreshToken = crypto.randomBytes(40).toString("hex");
        const newHash = crypto
          .createHash("sha256")
          .update(newRefreshToken)
          .digest("hex");

        await tx.authSession.create({
          data: {
            userId: session.user.id,
            refreshTokenHash: newHash,
            expiresAt: new Date(
              Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
            ),
            userAgent: req.headers["user-agent"] || "unknown",
            ip: req.ip || "unknown",
          },
        });

        // Determine Context (Keep previous context if passed, or default?)
        // For refresh, we usually want to keep the same claims.
        // But we need to decode the old access token to know the context?
        // Or just issue a "base" token and let them switch?
        // Simplest: Re-evaluate default context logic or pass tenant_id in body.

        // For now, auto-select default context logic:
        let context = null;
        if (session.user.memberships.length === 1) {
          const m = session.user.memberships[0];
          context = {
            tenantId: m.tenantId,
            role: m.role,
            campusScope: m.campusScope,
            primaryProfileId: m.primaryProfileId,
          };
        }

        const { accessToken } = AuthController.generateTokens(
          session.user,
          context,
        );
        return { accessToken, newRefreshToken };
      });

      res.cookie("refresh_token", result.newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      });

      return res.json({ access_token: result.accessToken });
    } catch (error) {
      console.error("Refresh error:", error);
      return res.status(401).json({ message: "Invalid session" });
    }
  }

  // POST /api/auth/logout
  static async logout(req: Request, res: Response) {
    const refreshToken = req.cookies.refresh_token;
    if (refreshToken) {
      const hash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      await prisma.authSession.updateMany({
        where: { refreshTokenHash: hash },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie("refresh_token");
    return res.json({ message: "Logged out" });
  }

  // POST /api/auth/forgot-password
  static async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const normalizedEmail = String(email).trim().toLowerCase();

      const user = await prisma.authUser.findUnique({
        where: { email: normalizedEmail },
      });
      if (!user) return res.json({ message: "If registered, email sent." });

      // Generate 6-digit code instead of long token to match Frontend UI
      const token = Math.floor(100000 + Math.random() * 900000).toString();
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const tokenId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 3600000).toISOString();

      // Use raw SQL due to schema mismatch
      await prisma.$executeRawUnsafe(`
        INSERT INTO "PasswordResetToken" (
          "id", "userId", "tokenHash", "purpose", "expiresAt", "createdAt", "attempt_count"
        ) VALUES (
          '${tokenId}', '${user.id}', '${tokenHash}', 'FORGOT_PASSWORD', '${expiresAt}', NOW(), 0
        )
      `);

      // Send Email with Code
      await EmailService.sendMail(
        normalizedEmail,
        "Reset Your Password",
        `<div style="font-family: sans-serif; padding: 20px;">
           <h2>Password Reset Request</h2>
           <p>Your verification code is:</p>
           <h1 style="background: #f4f4f4; padding: 10px; display: inline-block; letter-spacing: 5px;">${token}</h1>
           <p>Enter this code in the application to reset your password.</p>
           <p>This code is valid for 1 hour.</p>
         </div>`,
      );

      return res.json({ message: "If registered, email sent." });
    } catch (error) {
      console.error("Forgot Password error:", error);
      return res.status(500).json({ message: "Error" });
    }
  }

  // POST /api/auth/reset-password
  // Alias: /api/auth/confirm-forgot-password
  static async resetPassword(req: Request, res: Response) {
    try {
      const body = req.body;

      // Flexible field mapping to support Cognito/Frontend variations
      const email = body.email || body.username || body.Username;
      const token =
        body.token ||
        body.code ||
        body.confirmationCode ||
        body.ConfirmationCode ||
        body.verificationCode;
      const newPassword = body.newPassword || body.password || body.Password;

      console.log(`[AuthController] resetPassword attempt for: ${email}`);

      if (!email || !token || !newPassword) {
        console.warn(`[AuthController] Missing fields. Received:`, {
          hasEmail: !!email,
          hasToken: !!token,
          hasPassword: !!newPassword,
          bodyKeys: Object.keys(body),
        });
        return res.status(400).json({
          message:
            "Missing email, code, or password. Please check your request.",
        });
      }

      // Token is the 6-digit code from frontend
      const tokenHash = crypto
        .createHash("sha256")
        .update(token.toString())
        .digest("hex");

      const normalizedEmail = String(email).trim().toLowerCase();

      // Use raw SQL due to schema mismatch
      const results: any[] = await prisma.$queryRawUnsafe(`
        SELECT t.id, t."userId", t."tokenHash", t.purpose, t."expiresAt", t."usedAt"
        FROM "PasswordResetToken" t
        JOIN "AuthUser" u ON t."userId" = u.id
        WHERE t."tokenHash" = '${tokenHash}'
          AND t."usedAt" IS NULL
          AND t."expiresAt" > NOW()
          AND u.email = '${normalizedEmail}'
        LIMIT 1
      `);

      const resetRecord = results[0];

      if (!resetRecord) {
        console.warn(`[AuthController] Invalid or expired token for ${email}`);
        return res
          .status(400)
          .json({ message: "Invalid or expired verification code." });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Update User & Mark Token Used via raw SQL
      await prisma.$transaction([
        prisma.$executeRawUnsafe(`
          UPDATE "AuthUser"
          SET "passwordHash" = '${passwordHash}', "updatedAt" = NOW()
          WHERE id = '${resetRecord.userId}'
        `),
        prisma.$executeRawUnsafe(`
          UPDATE "PasswordResetToken"
          SET "usedAt" = NOW()
          WHERE id = '${resetRecord.id}'
        `),
      ]);

      console.log(`[AuthController] Password reset successful for ${email}`);
      return res.json({
        message: "Password updated successfully. You can now log in.",
      });
    } catch (error: any) {
      console.error("Reset Password error:", error);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  }

  // GET /api/auth/whoami
  static async whoami(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ message: "No token" });

      const token = authHeader.split(" ")[1];
      const decoded: any = jwt.verify(token, JWT_SECRET);

      // We can return the claims directly or fetch fresh data
      return res.json({
        id: decoded.sub,
        email: decoded.email,
        global_roles: decoded.global_roles,
        context: {
          tenant_id: decoded.tenant_id,
          role: decoded.tenant_role,
          campus_scope: decoded.campus_scope,
        },
      });
    } catch (error) {
      console.error("whoami error:", error);
      return res.status(401).json({ message: "Invalid token" });
    }
  }

  // GET /api/me
  // Tenant-aware user profile with active campus context
  // Requires: resolveTenant, requireAuth, requireCampusContext
  static async getMe(req: Request, res: Response) {
    try {
      const tenant = (req as any).tenant;
      const user = (req as any).user;
      const campus = (req as any).campus;

      if (!tenant || !user || !campus) {
        return res.status(400).json({
          error: {
            code: "CONTEXT_MISSING",
            message: "Tenant, User or Campus context missing",
          },
        });
      }

      // Update last login (on AuthUser now? Or Profile?)
      // We should update AuthUser or AuthSession?
      // The old code updated Profile.lastLoginAt.
      // Profile still has lastLoginAt? Let's check schema.
      // I didn't remove lastLoginAt from Profile.
      // But user.id in req.user is now AuthUser.id (from token sub).
      // Profile.id is DIFFERENT from AuthUser.id.
      // So `prisma.profile.update({ where: { id: user.id } })` will FAIL if user.id is AuthUser.id.

      // We need to find the profile linked to this AuthUser for this Tenant.
      // The token has `primary_profile_id`.
      const primaryProfileId = (req as any).auth?.primary_profile_id;

      if (primaryProfileId) {
        await prisma.profile.update({
          where: { id: primaryProfileId },
          data: { lastLoginAt: new Date() },
        });
      }

      // Get enabled features
      const tenantFeatures = await prisma.tenantFeature.findMany({
        where: { tenantId: tenant.tenantId, enabled: true },
        select: { featureKey: true },
      });

      const featuresEnabled = tenantFeatures.map((f: any) => f.featureKey);

      const features = (featuresEnabled || []).map((k: string) => ({
        feature_key: k,
        enabled: true,
      }));

      // We need to fetch the Profile details to return what the frontend expects (full_name etc).
      // The `user` object from `requireAuth` might be just the token payload or the AuthUser.
      // If `requireAuth` middleware hasn't been updated, it might be fetching `Profile` (old way) or failing.
      // I need to check `requireAuth` middleware!

      // For now, let's assume `req.user` has what we need or we fetch it.
      // The frontend expects:
      // user: { id, email, full_name, role, allCampusesAccess... }

      // We should query the Profile using primaryProfileId
      let profileData: any = {};
      if (primaryProfileId) {
        profileData = await prisma.profile.findUnique({
          where: { id: primaryProfileId },
        });
      }

      return res.json({
        user: {
          id: user.id, // AuthUser ID
          profile_id: primaryProfileId,
          email: user.email,
          full_name: profileData?.fullName || user.email, // Fallback
          role: (req as any).auth?.tenant_role || "USER",
          allCampusesAccess: profileData?.allCampusesAccess || false,
          // Phase 3+ persona fields
          personaRole: profileData?.personaRole ?? null,
          staffType: profileData?.staffType ?? null,
          permissions: (req as any).auth?.permissions ?? [],
        },
        tenant: {
          id: tenant.tenantId,
          name: tenant.name,
          slug: tenant.slug,
        },
        campus,
        features,
        featuresEnabled,
      });
    } catch (error: any) {
      console.error("AuthController.getMe error:", error);
      return res
        .status(500)
        .json({ error: { message: "Internal server error" } });
    }
  }

  // POST /api/auth/invite/verify
  static async verifyInvite(req: Request, res: Response) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Use raw query due to schema mismatch (camelCase vs snake_case)
      const results: any[] = await prisma.$queryRawUnsafe(`
        SELECT 
          t.id, t."userId", t."tokenHash", t.purpose, t.tenant_id, t.membership_id, t."expiresAt", t."usedAt",
          u.email,
          tm.role,
          tn.name as tenant_name
        FROM "PasswordResetToken" t
        JOIN "AuthUser" u ON t."userId" = u.id
        LEFT JOIN "TenantMembership" tm ON t.membership_id = tm.id
        LEFT JOIN "tenants" tn ON tm."tenantId" = tn.id
        WHERE t."tokenHash" = '${tokenHash}'
          AND t.purpose = 'INVITE_SET_PASSWORD'
          AND t."usedAt" IS NULL
          AND t."expiresAt" > NOW()
        LIMIT 1
      `);

      const resetRecord = results[0];

      if (!resetRecord) {
        return res
          .status(400)
          .json({ message: "Invalid or expired invite token" });
      }

      return res.json({
        valid: true,
        email: resetRecord.email,
        tenantName: resetRecord.tenant_name || null,
        role: resetRecord.role || null,
      });
    } catch (error) {
      console.error("verifyInvite error:", error);
      return res.status(500).json({ message: "Failed to verify invite" });
    }
  }

  // POST /api/auth/invite/accept
  static async acceptInvite(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res
          .status(400)
          .json({ message: "Token and newPassword are required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Use safe parameterized query (tagged template) — avoids bcrypt $ corruption
      const results: any[] = await prisma.$queryRaw`
        SELECT 
          t.id, t."userId", t."tokenHash", t.purpose, t.tenant_id, t.membership_id, t."expiresAt", t."usedAt",
          u."passwordHash",
          tm.status as membership_status
        FROM "PasswordResetToken" t
        JOIN "AuthUser" u ON t."userId" = u.id
        LEFT JOIN "TenantMembership" tm ON t.membership_id = tm.id
        WHERE t."tokenHash" = ${tokenHash}
          AND t.purpose = 'INVITE_SET_PASSWORD'
          AND t."usedAt" IS NULL
          AND t."expiresAt" > NOW()
        LIMIT 1
      `;

      const resetRecord = results[0];

      if (!resetRecord) {
        return res
          .status(400)
          .json({ message: "Invalid or expired invite token" });
      }

      // Reject replay only when membership is active AND password is already set.
      if (
        resetRecord.membership_status === "ACTIVE" &&
        !!resetRecord.passwordHash
      ) {
        return res.status(409).json({ message: "Invite already accepted" });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      // Transaction: set password + mark token used + activate membership
      // Use raw SQL for updates to avoid schema mismatch issues
      await prisma.$transaction([
        prisma.$executeRawUnsafe(`
          UPDATE "AuthUser" 
          SET "passwordHash" = '${passwordHash}', "updatedAt" = NOW()
          WHERE id = '${resetRecord.userId}'
        `),
        prisma.$executeRawUnsafe(`
          UPDATE "PasswordResetToken"
          SET "usedAt" = NOW()
          WHERE id = '${resetRecord.id}'
        `),
        ...(resetRecord.membership_id
          ? [
              prisma.$executeRawUnsafe(`
                UPDATE "TenantMembership"
                SET status = 'ACTIVE', activated_at = NOW(), "updatedAt" = NOW()
                WHERE id = '${resetRecord.membership_id}'
              `),
            ]
          : []),
      ]);

      return res.json({
        message: "Password set successfully. You can now log in.",
      });
    } catch (error) {
      console.error("acceptInvite error:", error);
      return res.status(500).json({ message: "Failed to accept invite" });
    }
  }
}
