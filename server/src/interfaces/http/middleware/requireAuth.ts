import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import prisma from "../../../infrastructure/prisma/client";
import { UserRole, CampusScope } from "../../../domain/User";
import { resolvePermissions } from "../permissions/resolver";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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

  try {
    // 1. Verify token with Cognito JWT Verifier
    let payload;
    try {
      const verifier = CognitoJwtVerifier.create({
        userPoolId: process.env.COGNITO_USER_POOL_ID!,
        tokenUse: "id",
        clientId: process.env.COGNITO_CLIENT_ID!,
      });
      payload = await verifier.verify(token);
    } catch (error) {
      console.error("Auth Error (Cognito):", error);
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
      });
      return;
    }

    const user = {
      id: payload.sub,
      email: payload.email?.toString(),
      user_metadata: {
        full_name: payload.name?.toString(),
        role: payload["custom:role"]?.toString(),
        campus_scope: payload["custom:campus_scope"]?.toString(),
      },
    };

    // 2. Fetch or Create Profile from Prisma
    // Use raw SQL to fetch profile and bypass Prisma enum validation
    let profileData: any = null;
    try {
      const userId = user.id.replace(/'/g, "''"); // Escape single quotes
      const rawProfiles = await prisma.$queryRawUnsafe(
        `SELECT id, email, full_name as "fullName", role, persona_role as "personaRole", staff_type as "staffType", campus_scope as "campusScope", is_active as "isActive", created_at as "createdAt", updated_at as "updatedAt", tenant_id as "tenantId", all_campuses_access as "allCampusesAccess" FROM profiles WHERE id = '${userId}'`,
      );
      if (Array.isArray(rawProfiles) && rawProfiles.length > 0) {
        profileData = rawProfiles[0];
        // Fix invalid campus_scope on the fly
        if (
          profileData.campusScope &&
          !["SCHOOL", "PU"].includes(profileData.campusScope)
        ) {
          console.log(
            `Fixing invalid campus_scope '${profileData.campusScope}' for user ${user.id}`,
          );
          profileData.campusScope = "SCHOOL";
          // Update in database
          try {
            await prisma.$executeRawUnsafe(
              `UPDATE profiles SET campus_scope = 'SCHOOL' WHERE id = '${userId}'`,
            );
          } catch (updateErr) {
            console.warn("Failed to update invalid campus_scope:", updateErr);
          }
        }
      }
    } catch (rawErr) {
      console.warn("Failed to fetch profile via raw SQL:", rawErr);
    }

    let profile: any = profileData;
    if (!profile) {
      // Try normal Prisma query as fallback
      try {
        profile = await prisma.profile.findUnique({
          where: { id: user.id },
        });
      } catch (prismaErr) {
        console.warn("Failed to fetch profile via Prisma:", prismaErr);
      }
    }

    if (!profile) {
      // Auto-create profile on first login if it doesn't exist
      // This handles users who authenticated with Supabase but don't have a profile yet
      if (!user.email) {
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "User email not found in auth token",
          },
        });
        return;
      }

      // Check if user is a PLATFORM user (e.g., super admin).
      // Platform users should NOT have a tenant profile auto-created.
      // If we are here, it means they logged in successfully (auth valid) but have no profile.
      // If their email is in platform_users, we should DENY access to tenant routes here,
      // because they should be using platform routes.
      // Or, if this IS a platform route (handled elsewhere?), requireAuth might be used?
      // Actually, requireAuth is tenant-scoped usually.

      // Let's check platform_users table quickly via raw SQL to avoid model dependency issues if any
      try {
        const platformCheck = await prisma.$queryRawUnsafe(
          `SELECT 1 FROM platform_users WHERE email = '${user.email}'`,
        );
        if (Array.isArray(platformCheck) && platformCheck.length > 0) {
          console.warn(
            `Blocked auto-profile creation for Platform User: ${user.email}`,
          );
          res.status(403).json({
            error: {
              code: "PLATFORM_USER",
              message: "Platform users cannot access tenant resources.",
            },
          });
          return;
        }
      } catch (err) {
        // Ignore check failure, proceed to tenant check
      }

      const fullName = user.user_metadata?.full_name || "";

      // Validate role is a valid UserRole enum value
      const validRoles = [
        "ADMIN",
        "ACCOUNTANT",
        "STAFF",
        "TEACHER",
        "STUDENT",
        "PARENT",
      ];
      const roleFromMetadata = user.user_metadata?.role;
      const role =
        roleFromMetadata && validRoles.includes(roleFromMetadata)
          ? roleFromMetadata
          : "STUDENT";

      // Validate campusScope is a valid CampusScope enum value
      const validCampusScopes = ["SCHOOL", "PU"];
      const campusScopeFromMetadata = user.user_metadata?.campus_scope;
      const campusScope =
        campusScopeFromMetadata &&
        validCampusScopes.includes(campusScopeFromMetadata)
          ? campusScopeFromMetadata
          : null;

      try {
        const tenantId = (req as any).tenant?.tenantId;
        if (!tenantId) {
          res
            .status(400)
            .json({
              error: {
                code: "TENANT_REQUIRED",
                message: "Tenant context missing for user initialization",
              },
            });
          return;
        }

        profile = await prisma.profile.create({
          data: {
            id: user.id,
            email: user.email,
            fullName: fullName,
            role: role as any, // Type assertion safe due to validation above
            campusScope: campusScope as any,
            isActive: true,
            tenant: { connect: { id: tenantId } },
          },
        });

        console.log(
          `Auto-created profile for user ${user.id} with role ${role}`,
        );
      } catch (createErr: any) {
        console.error(
          `Failed to auto-create profile for user ${user.id}:`,
          createErr?.message || createErr,
        );
        // If profile creation fails (e.g., duplicate email), treat as unauthorized
        res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Failed to initialize user profile",
          },
        });
        return;
      }
    }

    if (!profile.isActive) {
      console.warn(`Inactive user attempt: ${user.email}`);
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Account is deactivated." },
      });
      return;
    }

    // TENANT ISOLATION: Enforce profile.tenant_id === req.tenant.tenantId
    const tenantId = (req as any).tenant?.tenantId;
    if (tenantId) {
      if (!profile.tenantId) {
        res.status(403).json({
          error: {
            code: "TENANT_MISMATCH",
            message: "User profile is not associated with any tenant",
          },
        });
        return;
      }

      if (profile.tenantId !== tenantId) {
        console.warn(
          `Tenant isolation violation: User ${user.id} (profile tenant: ${profile.tenantId}) attempted to access resolved tenant: ${tenantId}`,
        );
        res.status(403).json({
          error: {
            code: "TENANT_MISMATCH",
            message: `You do not have access to this tenant. Profile: ${profile.tenantId}, Request: ${tenantId}`,
          },
        });
        return;
      }
    }

    // 3. Attach to Request
    (req as any).user = {
      id: profile.id,
      email: profile.email || user.email!, // Fallback to auth email if profile missing (shouldn't happen due to unique check)
      fullName: profile.fullName || "",
      role: profile.role as UserRole, // Casting Prisma Enum to Domain Enum (matches)
      campusScope: (profile.campusScope as CampusScope) ?? null,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      tenantId: profile.tenantId || "",
      allCampusesAccess: profile.allCampusesAccess || false,
      personaRole: profile.personaRole ?? null,
      staffType: profile.staffType ?? null,
    };

    // 4. Resolve and attach permissions context (Phase 3+)
    // resolvePermissions is always scoped by tenantId+profileId
    const resolvedTenantId =
      profile.tenantId || (req as any).tenant?.tenantId || "";
    const resolved =
      resolvedTenantId && profile.id
        ? await resolvePermissions({
            tenantId: resolvedTenantId,
            profileId: profile.id,
          }).catch((err) => {
            console.warn(
              "[requireAuth] resolvePermissions failed (non-fatal):",
              err?.message,
            );
            return {
              tenantWideKeys: new Set<string>(),
              campusKeys: new Map<string, Set<string>>(),
              allKeys: [] as string[],
            };
          })
        : {
            tenantWideKeys: new Set<string>(),
            campusKeys: new Map<string, Set<string>>(),
            allKeys: [] as string[],
          };

    (req as any).auth = {
      profile: (req as any).user,
      tenantId: resolvedTenantId,
      personaRole: profile.personaRole ?? null,
      staffType: profile.staffType ?? null,
      tenantWideKeys: resolved.tenantWideKeys,
      campusKeys: resolved.campusKeys,
      permissions: resolved.allKeys, // flattened, for /me API response
    };

    next();
  } catch (err: any) {
    console.error(
      "Unexpected Auth Middleware Error:",
      err?.message || String(err),
    );

    // Handle Prisma validation errors
    if (err?.message?.includes("not found in enum")) {
      console.error(
        "Invalid enum value detected in profile - data cleanup attempted via raw SQL",
      );
    }

    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal Server Error during Authentication",
      },
    });
    return;
  }
};
