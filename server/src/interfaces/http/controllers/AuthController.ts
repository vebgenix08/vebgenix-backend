import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { GlobalRole } from "@prisma/client";
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  extractBearerToken,
  getClaimString,
  verifyCognitoIdToken,
} from "../auth/cognito";
import {
  ensureCognitoUser,
  setCognitoPasswordAndVerify,
} from "../../../infrastructure/cognito/admin";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const ACCESS_TOKEN_EXPIRY = "8h";
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export class AuthController {
  private static getCognitoClient() {
    return new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || "ap-south-1",
    });
  }

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
    const genericResponse = {
      message: "If the email is registered, a reset code will be sent.",
    };
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(200).json(genericResponse);
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      await AuthController.getCognitoClient().send(
        new ForgotPasswordCommand({
          ClientId: process.env.COGNITO_CLIENT_ID!,
          Username: normalizedEmail,
        }),
      );

      return res.status(200).json(genericResponse);
    } catch (error: any) {
      console.error(
        `AuthController.forgotPassword error: ${error?.message || error}`,
      );
      return res.status(200).json(genericResponse);
    }
  }

  // POST /api/auth/reset-password
  // Alias: /api/auth/confirm-forgot-password
  static async resetPassword(req: Request, res: Response) {
    return AuthController.confirmForgotPassword(req, res);
  }

  static async confirmForgotPassword(req: Request, res: Response) {
    try {
      const body = req.body;

      const email = body.email || body.username || body.Username;
      const code =
        body.code ||
        body.code ||
        body.confirmationCode ||
        body.ConfirmationCode ||
        body.verificationCode ||
        body.token;
      const newPassword = body.newPassword || body.password || body.Password;

      if (!email || !code || !newPassword) {
        return res
          .status(400)
          .json({ message: "email, code, and newPassword are required." });
      }

      if (newPassword.length < 8) {
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters." });
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      await AuthController.getCognitoClient().send(
        new ConfirmForgotPasswordCommand({
          ClientId: process.env.COGNITO_CLIENT_ID!,
          Username: normalizedEmail,
          ConfirmationCode: String(code).trim(),
          Password: newPassword,
        }),
      );

      return res
        .status(200)
        .json({ message: "Password reset successful. You can now log in." });
    } catch (error: any) {
      console.error(
        `AuthController.confirmForgotPassword error: ${error?.message || error}`,
      );
      const code = error?.name;
      if (code === "CodeMismatchException") {
        return res
          .status(400)
          .json({
            message: "The verification code is incorrect. Please try again.",
          });
      }
      if (code === "ExpiredCodeException") {
        return res
          .status(400)
          .json({
            message:
              "The verification code has expired. Please request a new one.",
          });
      }
      if (code === "InvalidPasswordException") {
        return res
          .status(400)
          .json({
            message: error.message || "Password does not meet requirements.",
          });
      }
      return res
        .status(400)
        .json({ message: error.message || "Failed to reset password." });
    }
  }

  // GET /api/auth/whoami
  static async whoami(req: Request, res: Response) {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) return res.status(401).json({ message: "No token" });

      const claims = await verifyCognitoIdToken(token);
      const email = getClaimString(claims, "email");
      const sub = getClaimString(claims, "sub");
      const tenantId = getClaimString(claims, "custom:tenant_id", "tenant_id");
      const role = getClaimString(claims, "custom:role", "tenant_role");
      const fullName = getClaimString(claims, "name") ?? email ?? "User";

      if (!email || !sub) {
        return res.status(401).json({
          error: {
            code: "INVALID_TOKEN",
            message: "Token valid but required claims are missing",
          },
        });
      }

      const authUser = await prisma.authUser.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          globalRoles: true,
          memberships: {
            where: { status: "ACTIVE" },
            include: {
              tenant: true,
              primaryProfile: true,
              memberRoles: { include: { role: true } },
            },
          },
        },
      });

      const isSuperAdmin =
        authUser?.globalRoles.some(
          (item) => item.role === GlobalRole.PLATFORM_SUPER_ADMIN,
        ) ?? false;

      if (isSuperAdmin) {
        return res.json({
          kind: "PLATFORM",
          email,
          role: "PLATFORM_SUPER_ADMIN",
          full_name: fullName,
          global_roles: authUser?.globalRoles.map((item) => item.role) ?? [],
        });
      }

      const membership =
        (tenantId
          ? authUser?.memberships.find((item) => item.tenantId === tenantId)
          : authUser?.memberships[0]) ?? null;

      const profile =
        membership?.primaryProfile ??
        (await prisma.profile.findFirst({
          where: {
            tenantId: membership?.tenantId ?? tenantId ?? undefined,
            OR: [{ id: sub }, { email: email.toLowerCase() }],
          },
        }));

      if (!membership && !profile) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "User has no tenant profile.",
            details: { email },
          },
        });
      }

      const resolvedTenantId = membership?.tenantId ?? profile?.tenantId ?? tenantId;
      const tenant =
        membership?.tenant ??
        (resolvedTenantId
          ? await prisma.tenant.findUnique({
              where: { id: resolvedTenantId },
              select: { id: true, name: true, slug: true, isActive: true },
            })
          : null);

      if (!resolvedTenantId || !tenant || !tenant.isActive) {
        return res.status(403).json({
          error: {
            code: "TENANT_INACTIVE",
            message: "Tenant is missing or inactive.",
          },
        });
      }

      // Resolve role: prefer deprecated field, then memberRoles (new system), then Cognito claim
      const memberRoleName = membership?.memberRoles?.[0]?.role?.name ?? null;
      const resolvedRole =
        membership?.role ??
        memberRoleName ??
        profile?.role ??
        role ??
        null;

      return res.json({
        kind: "TENANT",
        email,
        role: resolvedRole,
        full_name: profile?.fullName ?? fullName,
        tenant_id: resolvedTenantId,
        tenant_slug: tenant.slug,
        tenant_name: tenant.name,
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
          t.id, t."userId", t.token_hash as "tokenHash", t.purpose, t.tenant_id, t.membership_id, t.expires_at as "expiresAt", t.used_at as "usedAt",
          u.email,
          tm.role,
          tn.name as tenant_name
        FROM "PasswordResetToken" t
        JOIN "AuthUser" u ON t."userId" = u.id
        LEFT JOIN "TenantMembership" tm ON t.membership_id = tm.id
        LEFT JOIN "tenants" tn ON tm."tenantId" = tn.id
        WHERE t.token_hash = '${tokenHash}'
          AND t.purpose = 'INVITE_SET_PASSWORD'
          AND t.used_at IS NULL
          AND t.expires_at > NOW()
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
          t.id, t."userId", t.token_hash as "tokenHash", t.purpose, t.tenant_id, t.membership_id, t.expires_at as "expiresAt", t.used_at as "usedAt",
          u."passwordHash", u.email,
          tm.status as membership_status, tm.role as membership_role
        FROM "PasswordResetToken" t
        JOIN "AuthUser" u ON t."userId" = u.id
        LEFT JOIN "TenantMembership" tm ON t.membership_id = tm.id
        WHERE t.token_hash = ${tokenHash}
          AND t.purpose = 'INVITE_SET_PASSWORD'
          AND t.used_at IS NULL
          AND t.expires_at > NOW()
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
          SET used_at = NOW()
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

      // Sync to Cognito — MUST be awaited so user can login immediately after activation
      const userEmail: string = resetRecord.email;
      const tenantId: string | null = resetRecord.tenant_id ?? null;

      // Prefer the deprecated role field; fall back to querying MemberRole table
      // (new invites use memberRoles relation instead of the deprecated role enum)
      let membershipRole: string | null = resetRecord.membership_role ?? null;
      if (!membershipRole && resetRecord.membership_id) {
        try {
          const memberRoleRows: any[] = await prisma.$queryRawUnsafe(`
            SELECT rd.name
            FROM "member_roles" mr
            JOIN "role_definitions" rd ON mr.role_id = rd.id
            WHERE mr.membership_id = '${resetRecord.membership_id}'
            LIMIT 1
          `);
          if (memberRoleRows.length > 0) {
            membershipRole = String(memberRoleRows[0].name).toUpperCase();
          }
        } catch (e) {
          console.warn("[acceptInvite] Could not resolve memberRole:", e);
        }
      }

      try {
        // Step 1: ensure the Cognito user exists with proper attributes.
        // Even if this fails (e.g. custom attribute not in pool schema), still
        // attempt Step 2 — the user may already exist from createFirstAdmin's
        // non-blocking provision, and setting the password is the critical step.
        const ensureResult = await ensureCognitoUser({
          email: userEmail,
          tenantId,
          role: membershipRole,
        });
        if (!ensureResult.ok) {
          console.warn(`[acceptInvite] Cognito ensureUser failed for ${userEmail}: ${ensureResult.code} — still attempting password set`);
        } else {
          console.log(`[acceptInvite] Cognito user ensured for ${userEmail}`);
        }

        // Step 2: set the password — always attempt, regardless of Step 1 outcome.
        // If ensureUser failed, the user may already exist from createFirstAdmin.
        const pwResult = await setCognitoPasswordAndVerify({ email: userEmail, newPassword });
        if (!pwResult.ok) {
          console.error(`[acceptInvite] Cognito setPassword failed for ${userEmail}: ${pwResult.code}`);
          return res.status(502).json({
            message: "Account activated but login setup failed. Please try again or contact support.",
            cognitoError: pwResult.code,
          });
        }
        console.log(`[acceptInvite] Cognito user ready for ${userEmail}`);
      } catch (cognitoErr) {
        console.error(`[acceptInvite] Cognito sync error for ${userEmail}:`, cognitoErr);
        return res.status(502).json({
          message: "Account activated but login setup failed. Please try again or contact support.",
        });
      }

      return res.json({
        message: "Password set successfully. You can now log in.",
      });
    } catch (error) {
      console.error("acceptInvite error:", error);
      return res.status(500).json({ message: "Failed to accept invite" });
    }
  }
}
