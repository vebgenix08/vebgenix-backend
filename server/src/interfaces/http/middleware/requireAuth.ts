import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../../infrastructure/prisma/client";
import { resolvePermissions } from "../permissions/resolver";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing Authorization header",
        },
      });
      return;
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing Bearer token" },
      });
      return;
    }

    // 1. Verify token with Local JWT
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      console.error("Auth Error (JWT):", error);
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      });
      return;
    }

    const authUserId = payload.sub;
    const tenantIdFromToken = payload.tenant_id;
    const tenantRoleFromToken = payload.tenant_role;
    const primaryProfileId = payload.primary_profile_id;
    
    // Check if we are in a tenant context (URL param)
    const urlTenantId = (req as any).tenant?.tenantId;

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

      // Fetch Profile
      let profile = null;
      if (primaryProfileId) {
        profile = await prisma.profile.findUnique({
          where: { id: primaryProfileId },
        });
      } else {
        // Fallback: Find profile via TenantMembership
        // We need to find the membership first to get the primaryProfileId (if it exists)
        // or just use the AuthUser ID if that was how it was set up.
        // BUT wait, AuthUser ID != Profile ID usually.
        // Let's check TenantMembership.
        const membership = await prisma.tenantMembership.findFirst({
            where: {
                userId: authUserId,
                tenantId: tenantIdFromToken,
                role: tenantRoleFromToken
            },
            include: { primaryProfile: true }
        });
        
        if (membership?.primaryProfile) {
            profile = membership.primaryProfile;
        } else {
            // Last resort: Check if a Profile exists with ID = AuthUser ID (legacy)
             profile = await prisma.profile.findUnique({
                where: { id: authUserId }
            });
            // Verify it belongs to this tenant
            if (profile && profile.tenantId !== tenantIdFromToken) {
                profile = null;
            }
        }
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
          tenant_role: tenantRoleFromToken,
          primary_profile_id: profile.id,
          permissions: resolved.allKeys,
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
        
        const isSuperAdmin = payload.global_roles?.includes('PLATFORM_SUPER_ADMIN');

        if (urlTenantId) {
            // URL requires tenant context
            if (isSuperAdmin) {
                // Allow Super Admin to impersonate/manage
                (req as any).user = {
                    id: authUserId, 
                    email: payload.email,
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
                    permissions: ["*"] 
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
                email: payload.email,
                global_roles: payload.global_roles
            };
             (req as any).auth = {
                permissions: []
            };
        }
    }

    next();
  } catch (err: any) {
    console.error("Unexpected Auth Middleware Error:", err);
    res.status(500).json({ error: { message: "Internal Server Error" } });
  }
};
