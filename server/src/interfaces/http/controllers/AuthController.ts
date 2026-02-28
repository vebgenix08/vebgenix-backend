import { Request, Response } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import prisma from "../../../infrastructure/prisma/client";

const PLATFORM_SUPER_ADMIN_EMAIL = "dhanushags08@gmail.com";

export class AuthController {
  /**
   * GET /api/auth/whoami
   * Deterministic auth routing endpoint
   * Returns user's role-world (PLATFORM or TENANT) to prevent ambiguous redirects
   */
  static async whoami(req: Request, res: Response) {
    console.log("[AuthController] whoami called");
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          error: {
            code: "NO_AUTH_HEADER",
            message: "Authorization header required",
          },
        });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({
          error: { code: "INVALID_TOKEN", message: "Missing Bearer token" },
        });
      }

      let payload;
      try {
        const verifier = CognitoJwtVerifier.create({
          userPoolId: process.env.COGNITO_USER_POOL_ID!,
          tokenUse: "id",
          clientId: process.env.COGNITO_CLIENT_ID!,
        });
        payload = await verifier.verify(token);
      } catch (authError) {
        return res.status(401).json({
          error: { code: "INVALID_TOKEN", message: "Invalid or expired token" },
        });
      }

      const user = {
        email: payload.email?.toString(),
        user_metadata: {
          full_name: payload.name?.toString(),
          role: payload["custom:role"]?.toString(),
        },
      };

      // Ensure email exists
      if (!user.email) {
        return res.status(401).json({
          error: {
            code: "INVALID_TOKEN",
            message: "Token valid but no email claim found",
          },
        });
      }

      // C1: Hard Lock for Super Admin
      if (
        user.email.toLowerCase() === PLATFORM_SUPER_ADMIN_EMAIL.toLowerCase()
      ) {
        return res.json({
          kind: "PLATFORM",
          email: user.email,
          role: "SUPER_ADMIN",
          full_name: user.user_metadata?.full_name || "Super Admin",
        });
      }

      // Platform: Supabase (table may not be in Prisma)
      let inPlatform = false;
      let platformUser: {
        id: string;
        email: string;
        full_name: string;
        role: string;
        is_active: boolean;
      } | null = null;
      try {
        // Use parameterized query for safety
        const platformRows: any[] = await prisma.$queryRaw`
           SELECT id, email, full_name, role, is_active 
           FROM platform_users 
           WHERE email = ${user.email}
        `;

        if (Array.isArray(platformRows) && platformRows.length > 0) {
          platformUser = platformRows[0];
          inPlatform = true;
        }
      } catch (err) {
        console.warn("Platform user check failed:", err);
      }

      // Tenant: Prisma (profiles + tenants)
      // Must verify email match too to be safe
      let profile = null;
      if (user.email) {
        try {
          profile = await prisma.profile.findUnique({
            where: { email: user.email }, // Use email as primary lookup for reliability
            include: { tenant: true },
          });
        } catch (err) {
          console.warn("Tenant profile lookup failed:", err);
        }
      }
      const inTenant = !!profile;

      console.log(
        `[DEBUG] whoami: ${user.email} | Platform: ${inPlatform} | Tenant: ${inTenant}`,
      );

      // Priority: Platform > Tenant
      // 1. Platform Check
      if (inPlatform && platformUser) {
        if (!platformUser.is_active) {
          return res.status(403).json({
            error: {
              code: "PLATFORM_USER_INACTIVE",
              message: "Platform user account is inactive",
            },
          });
        }
        return res.json({
          kind: "PLATFORM",
          email: platformUser.email,
          role: platformUser.role,
          full_name: platformUser.full_name,
        });
      }

      // 2. Tenant Check
      if (inTenant && profile) {
        if (!profile.isActive) {
          return res.status(403).json({
            error: {
              code: "TENANT_USER_INACTIVE",
              message: "Tenant user account is inactive",
            },
          });
        }
        const tenant = profile.tenant;
        if (!tenant) {
          return res.status(500).json({
            error: {
              code: "TENANT_NOT_FOUND",
              message: "Associated tenant not found",
            },
          });
        }
        if (!tenant.isActive) {
          return res.status(403).json({
            error: {
              code: "TENANT_INACTIVE",
              message: "Tenant subscription is inactive.",
            },
          });
        }
        return res.json({
          kind: "TENANT",
          email: profile.email,
          role: profile.role,
          full_name: profile.fullName ?? profile.email,
          tenant_id: profile.tenantId,
          tenant_subdomain: tenant.subdomain,
          tenant_name: tenant.name,
        });
      }

      // 3. Neither
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "User has no platform or tenant profile.",
          details: { email: user.email },
        },
      });
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.error("AuthController.whoami error:", message, error);
      if (res.headersSent) return;
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          details: message,
        },
      });
    }
  }

  // POST /api/auth/forgot-password (Public UI)
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

      const client = new CognitoIdentityProviderClient({
        region: process.env.AWS_REGION || "ap-south-1",
      });
      await client.send(
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
  /**
   * GET /api/me
   * Tenant-aware user profile with active campus context
   * Requires: resolveTenant, requireAuth, requireCampusContext
   */
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

      // Update last login
      await prisma.profile.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

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

      return res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          allCampusesAccess: user.allCampusesAccess,
          // Phase 3+ persona fields (nullable until backfill runs)
          personaRole: user.personaRole ?? null,
          staffType: user.staffType ?? null,
          // Flattened permission keys for UI gating. NOT for server-side enforcement.
          permissions: (req as any).auth?.permissions ?? [],
        },
        tenant: {
          id: tenant.tenantId,
          name: tenant.name,
          subdomain: tenant.subdomain,
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
}
