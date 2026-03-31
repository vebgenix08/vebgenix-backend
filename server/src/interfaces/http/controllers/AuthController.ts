import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { GlobalRole } from "@prisma/client";
import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { ensureCognitoUser, setCognitoPasswordAndVerify } from "../../../infrastructure/cognito/admin";
import { resolveMediaUrl } from "../../../infrastructure/aws/s3-media";
import { PlatformService } from "../../../services/PlatformService";
import { getBearerToken, verifyRequestToken } from "../middleware/auth-token";

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

      const PLATFORM_SUPER_ADMIN_EMAIL = "dhanush@vebgenix.com";
      const isSuperAdmin =
        normalizedEmail === PLATFORM_SUPER_ADMIN_EMAIL &&
        user.globalRoles.some((gr) => gr.role === GlobalRole.PLATFORM_SUPER_ADMIN);

      if (isSuperAdmin) {
        // Platform Context
        context = { role: "SUPER_ADMIN" }; // Special marker
      } else if (user.memberships.length === 1) {
        // Single Tenant -> Auto-select
        const membership = user.memberships[0];
        let primaryProfileId = membership.primaryProfileId;
        if (!primaryProfileId) {
          const profile = await prisma.profile.findUnique({
            where: { id: user.id },
            select: { id: true, tenantId: true },
          });
          if (profile?.tenantId === membership.tenantId) {
            primaryProfileId = profile.id;
            await prisma.tenantMembership.update({
              where: { id: membership.id },
              data: { primaryProfileId: profile.id },
            });
          }
        }
        context = {
          tenantId: membership.tenantId,
          role: membership.role,
          campusScope: membership.campusScope,
          primaryProfileId,
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
      let primaryProfileId = membership.primaryProfileId;
      if (!primaryProfileId) {
        const profile = await prisma.profile.findUnique({
          where: { id: session.user.id },
          select: { id: true, tenantId: true },
        });
        if (profile?.tenantId === membership.tenantId) {
          primaryProfileId = profile.id;
          await prisma.tenantMembership.update({
            where: { id: membership.id },
            data: { primaryProfileId: profile.id },
          });
        }
      }
      const context = {
        tenantId: membership.tenantId,
        role: membership.role,
        campusScope: membership.campusScope,
        primaryProfileId,
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
          ClientId:
            process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID!,
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
          ClientId:
            process.env.COGNITO_CLIENT_ID || process.env.USER_POOL_CLIENT_ID!,
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
      const token = getBearerToken(req.headers.authorization);
      if (!token) return res.status(401).json({ message: "No token" });

      const claims = await verifyRequestToken(token);
      const email = claims.email;
      const sub = claims.sub;
      const tenantId = claims.tenantId;
      const role = claims.tenantRole;
      const fullName =
        typeof claims.raw.name === "string" ? claims.raw.name : email ?? "User";

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
            include: { tenant: true, primaryProfile: true },
          },
        },
      });

      const PLATFORM_SUPER_ADMIN_EMAIL_COGNITO = "dhanush@vebgenix.com";
      const isSuperAdmin =
        email.toLowerCase() === PLATFORM_SUPER_ADMIN_EMAIL_COGNITO &&
        (authUser?.globalRoles.some(
          (item) => item.role === GlobalRole.PLATFORM_SUPER_ADMIN,
        ) ?? false);

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

      const resolvedTenantId =
        membership?.tenantId ?? profile?.tenantId ?? tenantId;
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

      return res.json({
        kind: "TENANT",
        email,
        role: membership?.role ?? profile?.role ?? role,
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
      const auth = (req as any).auth;
      const authUserId = auth?.authUserId;

      if (!tenant || !user || !campus || !authUserId) {
        return res.status(400).json({
          error: {
            code: "CONTEXT_MISSING",
            message: "Tenant, User or Campus context missing",
          },
        });
      }

      const primaryProfileId = auth?.primary_profile_id;
      await PlatformService.ensureRequiredTenantFeatures(tenant.tenantId);

      if (primaryProfileId) {
        await prisma.profile.update({
          where: { id: primaryProfileId },
          data: { lastLoginAt: new Date() },
        });
      }

      const isAllCampusesAccess = user.allCampusesAccess === true;
      const [tenantFeatures, accessibleCampuses] = await Promise.all([
        prisma.tenantFeature.findMany({
          where: { tenantId: tenant.tenantId, enabled: true },
          select: { featureKey: true },
          orderBy: { featureKey: "asc" },
        }),
        isAllCampusesAccess
          ? prisma.campus.findMany({
              where: { tenantId: tenant.tenantId, isActive: true },
              select: { id: true, name: true, campusType: true, isActive: true },
              orderBy: { createdAt: "asc" },
            })
          : prisma.userCampusAccess.findMany({
              where: {
                tenantId: tenant.tenantId,
                profileId: user.id,
                campus: {
                  isActive: true,
                },
              },
              select: {
                campus: {
                  select: {
                    id: true,
                    name: true,
                    campusType: true,
                    isActive: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            }).then((rows) => rows.map((row: any) => row.campus)),
      ]);

      const featuresEnabled = tenantFeatures.map((f: any) => f.featureKey);
      const features = featuresEnabled.map((featureKey: string) => ({
        feature_key: featureKey,
        enabled: true,
      }));

      const campuses = accessibleCampuses.map((campusRow: any) => ({
        id: campusRow.id,
        name: campusRow.name,
        campus_type: campusRow.campusType,
        is_active: campusRow.isActive,
      }));

      const [avatarUrl, tenantLogoUrl] = await Promise.all([
        resolveMediaUrl(user.avatarKey, user.avatarUrl),
        resolveMediaUrl(tenant.logoKey, tenant.logoUrl),
      ]);

      return res.json({
        user: {
          id: user.id,
          auth_user_id: authUserId,
          profile_id: primaryProfileId,
          email: user.email,
          full_name: user.fullName || user.email,
          avatar_url: avatarUrl,
          role: user.role || auth?.tenant_role || "USER",
          tenant_roles: auth?.tenantRoles ?? [],
          allCampusesAccess: isAllCampusesAccess,
          personaRole: user.personaRole ?? null,
          staffType: user.staffType ?? null,
          permissions: auth?.permissions ?? [],
          campusScope: auth?.campus_scope ?? null,
        },
        tenant: {
          id: tenant.tenantId,
          name: tenant.name,
          slug: tenant.slug,
          logo_url: tenantLogoUrl,
        },
        campus,
        campuses,
        campusesUserCanAccess: campuses,
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
      const { token, email, userId } = req.body;
      if (!token || !email) {
        return res.status(400).json({ message: "Token and email are required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const normalizedEmail = String(email).trim().toLowerCase();

      const inviteRecord = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash,
          purpose: "INVITE_SET_PASSWORD",
          usedAt: null,
          expiresAt: { gt: new Date() },
          ...(userId ? { userId: String(userId) } : {}),
          user: { email: normalizedEmail },
        },
        include: {
          user: { select: { id: true, email: true } },
          membership: {
            select: {
              role: true,
              tenant: { select: { name: true } },
            },
          },
        },
      });

      if (!inviteRecord) {
        return res
          .status(400)
          .json({ message: "Invalid or expired invite token" });
      }

      return res.json({
        valid: true,
        userId: inviteRecord.user.id,
        email: inviteRecord.user.email,
        tenantName: inviteRecord.membership?.tenant?.name || null,
        role: inviteRecord.membership?.role || null,
      });
    } catch (error) {
      console.error("verifyInvite error:", error);
      return res.status(500).json({ message: "Failed to verify invite" });
    }
  }

  // POST /api/auth/invite/accept
  static async acceptInvite(req: Request, res: Response) {
    try {
      const { token, newPassword, email, userId } = req.body;
      if (!token || !newPassword || !email) {
        return res
          .status(400)
          .json({ message: "Token, email and newPassword are required" });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const normalizedEmail = String(email).trim().toLowerCase();

      const inviteRecord = await prisma.passwordResetToken.findFirst({
        where: {
          tokenHash,
          purpose: "INVITE_SET_PASSWORD",
          usedAt: null,
          expiresAt: { gt: new Date() },
          ...(userId ? { userId: String(userId) } : {}),
          user: { email: normalizedEmail },
        },
        include: {
          user: { select: { id: true, passwordHash: true, email: true } },
          membership: {
            select: {
              id: true,
              status: true,
              tenantId: true,
              role: true,
              primaryProfile: { select: { fullName: true } },
            },
          },
        },
      });

      if (!inviteRecord) {
        return res
          .status(400)
          .json({ message: "Invalid or expired invite token" });
      }

      // Reject replay only when membership is active AND password is already set.
      if (
        inviteRecord.membership?.status === "ACTIVE" &&
        !!inviteRecord.user.passwordHash
      ) {
        return res.status(409).json({ message: "Invite already accepted" });
      }

      let cognito = await setCognitoPasswordAndVerify({
        email: normalizedEmail,
        newPassword,
      });

      if (!cognito.ok && cognito.code === "COGNITO_USER_NOT_FOUND") {
        const provisioned = await ensureCognitoUser({
          email: normalizedEmail,
          fullName: inviteRecord.membership?.primaryProfile?.fullName || null,
          tenantId: inviteRecord.membership?.tenantId || null,
          role: inviteRecord.membership?.role || null,
        });

        if (!provisioned.ok) {
          console.error("[AcceptInvite] Cognito ensure user failed:", provisioned);
          return res.status(502).json({
            message:
              provisioned.code === "AWS_CREDENTIALS_MISSING" ||
              provisioned.code === "AWS_CREDENTIALS_INVALID"
                ? "Server AWS credentials are missing/invalid. Configure AWS credentials and retry."
                : provisioned.code === "COGNITO_NOT_AUTHORIZED" ||
                    provisioned.code === "COGNITO_ACCESS_DENIED"
                  ? "Server is not authorized to create Cognito users. Fix IAM permissions and retry."
                  : provisioned.code === "COGNITO_CONFIG_MISSING"
                    ? "Server Cognito configuration is missing (USER_POOL_ID)."
                    : "Failed to provision Cognito user. Please retry.",
            code: provisioned.code,
            errorName: provisioned.errorName,
          });
        }

        cognito = await setCognitoPasswordAndVerify({
          email: normalizedEmail,
          newPassword,
        });
      }

      if (!cognito.ok) {
        console.error("[AcceptInvite] Cognito sync failed:", {
          code: cognito.code,
          errorName: cognito.errorName,
        });
        return res.status(502).json({
          message:
            cognito.code === "COGNITO_USER_NOT_FOUND"
              ? "Account is not ready yet. Cognito user provisioning is still pending. Please retry in a minute."
              : cognito.code === "COGNITO_INVALID_PASSWORD"
                ? "Password does not meet the requirements. Use at least 8 characters with uppercase, lowercase, number and symbol."
                : cognito.code === "AWS_CREDENTIALS_MISSING" ||
                  cognito.code === "AWS_CREDENTIALS_INVALID"
                ? "Server AWS credentials are missing/invalid. Configure AWS credentials and retry."
                : cognito.code === "COGNITO_NOT_AUTHORIZED"
                  ? "Server is not authorized to update Cognito users. Fix IAM permissions and retry."
                  : cognito.code === "COGNITO_CONFIG_MISSING"
                    ? "Server Cognito configuration is missing (USER_POOL_ID)."
                    : "Failed to sync with Cognito. Please retry.",
          code: cognito.code,
          errorName: cognito.errorName,
        });
      }

      try {
        await ensureCognitoUser({
          email: normalizedEmail,
          fullName: inviteRecord.membership?.primaryProfile?.fullName || null,
          tenantId: inviteRecord.membership?.tenantId || null,
          role: inviteRecord.membership?.role || null,
        });
      } catch (_) {
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      const now = new Date();
      await prisma.$transaction([
        prisma.authUser.update({
          where: { id: inviteRecord.user.id },
          data: { passwordHash, updatedAt: now },
        }),
        prisma.passwordResetToken.update({
          where: { id: inviteRecord.id },
          data: { usedAt: now },
        }),
        ...(inviteRecord.membership?.id
          ? [
              prisma.tenantMembership.update({
                where: { id: inviteRecord.membership.id },
                data: { status: "ACTIVE", activatedAt: now, updatedAt: now },
              }),
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
