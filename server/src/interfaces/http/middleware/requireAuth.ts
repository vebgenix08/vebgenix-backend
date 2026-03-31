import { Request, Response, NextFunction } from "express";
import prisma from "../../../infrastructure/prisma/client";
import { resolvePermissions } from "../permissions/resolver";
import {
  extractBearerToken,
  getClaimString,
  getClaimStringArray,
  verifyCognitoIdToken,
} from "../auth/cognito";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Authorization header",
        },
      });
      return;
    }

    let claims: any;
    try {
      claims = (req as any).auth?.claims ?? (await verifyCognitoIdToken(token));
    } catch (error) {
      console.error("Auth Error (Cognito):", error);
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      });
      return;
    }

    const authUserId = getClaimString(claims, "sub");
    const authEmail = getClaimString(claims, "email");
    const tenantIdFromClaims = getClaimString(
      claims,
      "custom:tenant_id",
      "tenant_id",
    );
    const tenantIdFromToken =
      tenantIdFromClaims ?? ((req.headers["x-tenant-id"] as string) || null);
    const tenantRoleFromToken =
      getClaimString(claims, "custom:role", "tenant_role") ?? undefined;
    const primaryProfileId = getClaimString(claims, "sub");
    const globalRoles = getClaimStringArray(claims, "cognito:groups");
    
    // Check if we are in a tenant context (URL param)
    const urlTenantId = (req as any).tenant?.tenantId;

    const authUser =
      authEmail
        ? await prisma.authUser.findUnique({
            where: { email: authEmail.toLowerCase() },
            include: {
              globalRoles: true,
              memberships: {
                where: { status: "ACTIVE" },
                include: { primaryProfile: true },
              },
            },
          })
        : null;

    const isSuperAdmin =
      globalRoles.includes("PLATFORM_SUPER_ADMIN") ||
      authUser?.globalRoles.some((role) => role.role === "PLATFORM_SUPER_ADMIN") ||
      false;

    if (tenantIdFromToken) {
      // If token has tenant, enforce match with URL tenant if present
      if (urlTenantId && urlTenantId !== tenantIdFromToken) {
        res.status(403).json({
          error: {
            code: "TENANT_MISMATCH",
            message: "Token is not valid for this tenant scope",
          },
        });
        return;
      }

      // Fetch Profile — use DB-resolved authUser.id, not Cognito sub
      let profile = null;

      // 1. Try via membership's primaryProfile (already included in authUser query)
      const membership = authUser?.memberships.find(
        (m) => m.tenantId === tenantIdFromToken,
      );
      if (membership?.primaryProfile) {
        profile = membership.primaryProfile;
      }

      // 2. Try profile by DB AuthUser id
      if (!profile && authUser?.id) {
        const byDbId = await prisma.profile.findUnique({
          where: { id: authUser.id },
        });
        if (byDbId && byDbId.tenantId === tenantIdFromToken) {
          profile = byDbId;
        }
      }

      // 3. Try by email + tenantId
      if (!profile && authEmail) {
        profile = await prisma.profile.findFirst({
          where: {
            email: authEmail.toLowerCase(),
            tenantId: tenantIdFromToken,
          },
        });
      }

      if (profile) {
        // Attach as Legacy Profile User
        (req as any).user = {
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          role: profile.role,
          campusScope: profile.campusScope,
          isActive: profile.isActive,
          tenantId: profile.tenantId,
          allCampusesAccess: profile.allCampusesAccess,
          personaRole: profile.personaRole,
          staffType: profile.staffType,
        };

        // Resolve Permissions
        const resolved = await resolvePermissions({
          tenantId: tenantIdFromToken,
          profileId: profile.id,
        });

        (req as any).auth = {
          profile: (req as any).user,
          tenantId: tenantIdFromToken,
          tenant_role: tenantRoleFromToken ?? profile.role,
          primary_profile_id: profile.id,
          permissions: resolved.allKeys,
          global_roles: globalRoles,
        };
      } else {
        // AuthUser has membership but NO Profile record found.
        console.error(`[requireAuth] Profile not found for User ${authUserId} in Tenant ${tenantIdFromToken}`);
        res.status(403).json({
          error: { message: "Tenant profile not found for this user." },
        });
        return;
      }
    } else {
        // Token has NO tenant context (Platform or initial login)

        if (urlTenantId) {
            // URL requires tenant context
            if (isSuperAdmin) {
                // Allow Super Admin to impersonate/manage
                (req as any).user = {
                    id: authUserId, 
                    email: authEmail,
                    fullName: "Super Admin",
                    role: "ADMIN",
                    campusScope: "ALL",
                    isActive: true,
                    tenantId: urlTenantId,
                    allCampusesAccess: true
                };
                (req as any).auth = {
                    tenantId: urlTenantId,
                    tenant_role: "SUPER_ADMIN",
                    permissions: ["*"],
                    global_roles: globalRoles,
                };
            } else {
                res.status(403).json({ 
                    error: { code: "TENANT_SELECTION_REQUIRED", message: "Please select a tenant to proceed." } 
                });
                return;
            }
        } else {
            // Platform API or User Profile API (no tenant context)
            (req as any).user = {
                id: authUserId,
                email: authEmail,
                global_roles: globalRoles
            };
             (req as any).auth = {
                permissions: [],
                global_roles: globalRoles,
            };
        }
    }

    next();
  } catch (err: any) {
    console.error("Unexpected Auth Middleware Error:", err);
    res.status(500).json({ error: { message: "Internal Server Error" } });
  }
};
