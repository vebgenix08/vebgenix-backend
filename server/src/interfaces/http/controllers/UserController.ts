import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import { EmailService } from "../../../infrastructure/services/emailService";
import { UserRole } from "@prisma/client";

const PLATFORM_SUPER_ADMIN_EMAIL = "dhanushags08@gmail.com";
const ALLOWED_TENANT_ROLES = [
  "ACCOUNTANT",
  "TEACHER",
  "STUDENT",
  "STAFF",
  "PARENT",
];
// Fallback constant if env var is missing, usually for local dev
const DEFAULT_APP_BASE_URL =
  process.env.APP_BASE_URL || "http://localhost:5173";

// Helper for email validation
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Helper to get public app origin
const getPublicAppOrigin = (req: Request): string => {
  // 1. Prefer strict Environment Variable (safest for production/docker)
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;

  // 2. Origin header (browser's view of the frontend)
  const origin = req.headers["origin"];
  if (origin) return origin;

  // 3. Referer header (fallback for browser)
  const referer = req.headers["referer"];
  if (referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch (e) {
      // invalid url, ignore
    }
  }

  // 4. Forwarded headers (for proxies)
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // 5. Fallback to constant default (localhost:5173)
  return DEFAULT_APP_BASE_URL;
};

// Helper to find auth user with pagination
async function findAuthUserByEmail(email: string) {
  // Check AuthUser (Central Identity)
  const user = await prisma.authUser.findUnique({
    where: { email: email.toLowerCase() },
  });
  return user;
}

// Helper to get or create auth user
async function getOrCreateAuthUser(email: string) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    return { userId: existing.id, alreadyExisted: true };
  }

  // Create AuthUser
  const newUser = await prisma.authUser.create({
    data: {
      email: email.toLowerCase(),
      status: "ACTIVE",
    },
  });

  return { userId: newUser.id, alreadyExisted: false };
}

// Helper to check platform user existence
async function isPlatformUser(email: string): Promise<boolean> {
  if (email.toLowerCase() === PLATFORM_SUPER_ADMIN_EMAIL.toLowerCase())
    return true;

  const user = await prisma.authUser.findUnique({
    where: { email: email.toLowerCase() },
    include: { globalRoles: true },
  });

  if (!user) return false;
  return user.globalRoles.some((gr: any) => gr.role === "PLATFORM_SUPER_ADMIN");
}

export class UserController {
  /**
   * GET /api/admin/users
   * Lists users for the current tenant only.
   */
  static async getUsers(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId;
      // const campusId = (req as any).campus?.campusId;

      if (!tenantId) throw new Error("Tenant context missing");

      const {
        query,
        role,
        status,
        campus_id,
        page = 1,
        limit = 20,
      } = req.query;

      const where: any = { tenantId };

      if (query) {
        where.OR = [
          { fullName: { contains: String(query), mode: "insensitive" } },
          { email: { contains: String(query), mode: "insensitive" } },
        ];
      }
      if (role && role !== "all") where.role = String(role).toUpperCase();
      if (status && status !== "all") where.isActive = status === "active";
      if (campus_id) {
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { allCampusesAccess: true },
              { campusAccess: { some: { campusId: String(campus_id) } } },
            ],
          },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [rows, total] = await Promise.all([
        prisma.profile.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: "desc" },
          include: {
            employee: true,
            campusAccess: { include: { campus: true } },
          },
        }),
        prisma.profile.count({ where }),
      ]);

      const users = rows.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        fullName: u.fullName,
        role: u.role,
        is_active: u.isActive,
        isActive: u.isActive,
        all_campuses_access: u.allCampusesAccess,
        allCampusesAccess: u.allCampusesAccess,
        campus_ids: u.campusAccess.map((ca) => ca.campusId),
        campusAccess: u.campusAccess.map((ca) => ({
          campus: {
            id: ca.campus.id,
            name: ca.campus.name,
            campusType: ca.campus.campusType,
          },
        })),
        employee: u.employee
          ? {
              employee_code: u.employee.employeeCode,
              employeeCode: u.employee.employeeCode,
              phone: u.employee.phone,
              designation: u.employee.designation,
              department: u.employee.department,
              joined_on:
                u.employee.joinedOn?.toISOString?.()?.slice(0, 10) ?? null,
              joinedOn: u.employee.joinedOn,
            }
          : null,
        last_login_at: u.lastLoginAt?.toISOString?.() ?? null,
        lastLoginAt: u.lastLoginAt,
        created_at: u.createdAt?.toISOString?.() ?? null,
        createdAt: u.createdAt,
      }));

      return res.json({
        users,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (err: any) {
      console.error(`UserController.getUsers error: ${err.message}`);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch users" },
      });
    }
  }

  /**
   * GET /api/admin/users/:id
   * Get single user details
   */
  static async getUser(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId;
      if (!tenantId) throw new Error("Tenant context missing");

      const { id } = req.params;

      const user = await prisma.profile.findUnique({
        where: { id },
        include: {
          employee: true,
          campusAccess: {
            include: { campus: true },
          },
        },
      });

      if (!user || user.tenantId !== tenantId) {
        return res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "User not found" } });
      }

      const out = {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        fullName: user.fullName,
        role: user.role,
        is_active: user.isActive,
        isActive: user.isActive,
        all_campuses_access: user.allCampusesAccess,
        allCampusesAccess: user.allCampusesAccess,
        campus_ids: user.campusAccess.map((ca) => ca.campusId),
        campusAccess: user.campusAccess.map((ca) => ({
          campus: {
            id: ca.campus.id,
            name: ca.campus.name,
            campusType: ca.campus.campusType,
          },
        })),
        employee: user.employee
          ? {
              employee_code: user.employee.employeeCode,
              employeeCode: user.employee.employeeCode,
              phone: user.employee.phone,
              designation: user.employee.designation,
              department: user.employee.department,
              joined_on:
                user.employee.joinedOn?.toISOString?.()?.slice(0, 10) ?? null,
              joinedOn: user.employee.joinedOn,
            }
          : null,
        last_login_at: user.lastLoginAt?.toISOString?.() ?? null,
        lastLoginAt: user.lastLoginAt,
        created_at: user.createdAt?.toISOString?.() ?? null,
        createdAt: user.createdAt,
      };
      return res.json(out);
    } catch (err: any) {
      console.error(`UserController.getUser error: ${err.message}`);
      return res
        .status(500)
        .json({ error: { message: "Failed to fetch user" } });
    }
  }

  /**
   * POST /api/admin/users
   * Creates or updates a user in the current tenant (Invite flow).
   */
  static async createUser(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId;
      if (!tenantId) throw new Error("Tenant context missing");

      const {
        email,
        full_name,
        role,
        all_campuses_access,
        campus_ids,
        employee,
        sendInvite,
      } = req.body;

      if (!email || !full_name || !role) {
        return res.status(400).json({
          error: { code: "BAD_REQUEST", message: "Missing required fields" },
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({
          error: { code: "BAD_REQUEST", message: "Invalid email format" },
        });
      }

      // B1: Role Normalization + Allowlist
      const roleUpper = String(role).trim().toUpperCase();
      if (!ALLOWED_TENANT_ROLES.includes(roleUpper)) {
        // Explicitly forbid ADMIN and SUPER_ADMIN here by exclusion, but also explicit check for clarity
        if (["ADMIN", "SUPER_ADMIN"].includes(roleUpper)) {
          return res.status(403).json({
            error: {
              code: "ADMIN_ROLE_FORBIDDEN",
              message:
                "Only Super Admin creates tenant admins via platform routes",
            },
          });
        }
        return res.status(400).json({
          error: {
            code: "INVALID_ROLE",
            message: `Role ${roleUpper} is not allowed.`,
          },
        });
      }

      // C2: Platform Exclusion
      if (await isPlatformUser(normalizedEmail)) {
        return res.status(409).json({
          error: {
            code: "PLATFORM_EMAIL_FORBIDDEN",
            message: "Platform users cannot be added as tenant users",
          },
        });
      }

      // B3: Campus IDs must belong to tenant
      if (Array.isArray(campus_ids) && campus_ids.length > 0) {
        const validCount = await prisma.campus.count({
          where: {
            tenantId,
            id: { in: campus_ids },
          },
        });
        if (validCount !== campus_ids.length) {
          return res.status(404).json({
            error: {
              code: "CAMPUS_NOT_FOUND",
              message:
                "One or more provided campuses do not belong to this tenant.",
            },
          });
        }
      }

      // B4: Campus assignment rules
      if (["TEACHER", "STUDENT", "STAFF"].includes(roleUpper)) {
        if (all_campuses_access) {
          return res.status(400).json({
            error: {
              code: "CAMPUS_ACCESS_REQUIRED",
              message: `${roleUpper} cannot have all-campus access. Specific campus assignment required.`,
            },
          });
        }
        if (
          !campus_ids ||
          !Array.isArray(campus_ids) ||
          campus_ids.length === 0
        ) {
          return res.status(400).json({
            error: {
              code: "CAMPUS_ACCESS_REQUIRED",
              message: `${roleUpper} must be assigned to at least one campus.`,
            },
          });
        }
      }

      // Validate Campus Mix for Restricted Roles (Cross-Type)
      if (
        ["TEACHER", "STAFF"].includes(roleUpper) &&
        campus_ids &&
        campus_ids.length > 1
      ) {
        const selectedCampuses = await prisma.campus.findMany({
          where: { id: { in: campus_ids } },
          select: { campusType: true },
        });
        const types = new Set(selectedCampuses.map((c) => c.campusType));
        if (types.has("SCHOOL") && types.has("PU")) {
          return res.status(409).json({
            error: {
              code: "CROSS_TYPE_ASSIGNMENT_FORBIDDEN",
              message:
                "Teachers and Staff cannot be assigned to both School and College campuses.",
            },
          });
        }
      }

      // 1. One-Tenant-Per-Email Check (REMOVED for multi-tenant support)
      // We allow users to be in multiple tenants.
      // const existingProfile = await prisma.profile.findFirst({
      //   where: { email: normalizedEmail },
      // });
      // if (existingProfile && existingProfile.tenantId !== tenantId) { ... }

      // B2: Get or Create Auth User (No Role in Metadata)
      const { userId, alreadyExisted } =
        await getOrCreateAuthUser(normalizedEmail);

      // 4. Upsert Data
      await prisma.$transaction(async (tx) => {
        // Upsert Profile
        await tx.profile.upsert({
          where: { id: userId },
          create: {
            id: userId,
            tenantId,
            email: normalizedEmail,
            fullName: full_name,
            role: roleUpper as UserRole,
            allCampusesAccess: !!all_campuses_access,
            isActive: true,
          },
          update: {
            fullName: full_name,
            role: roleUpper as UserRole,
            allCampusesAccess: !!all_campuses_access,
            isActive: true,
            email: normalizedEmail,
          },
        });

        // Upsert Employee
        if (employee) {
          if (employee.employee_code) {
            const existingEmp = await tx.employee.findUnique({
              where: {
                tenantId_employeeCode: {
                  tenantId,
                  employeeCode: employee.employee_code,
                },
              },
            });
            if (existingEmp && existingEmp.profileId !== userId) {
              throw new Error(
                `Employee code '${employee.employee_code}' already in use`,
              );
            }
          }

          await tx.employee.upsert({
            where: { profileId: userId },
            create: {
              tenantId,
              profileId: userId,
              employeeCode: employee.employee_code,
              phone: employee.phone,
              designation: employee.designation,
              department: employee.department,
              joinedOn: employee.joined_on
                ? new Date(employee.joined_on)
                : null,
            },
            update: {
              employeeCode: employee.employee_code,
              phone: employee.phone,
              designation: employee.designation,
              department: employee.department,
              joinedOn: employee.joined_on
                ? new Date(employee.joined_on)
                : null,
            },
          });
        }

        // Campus Access
        if (all_campuses_access) {
          await tx.userCampusAccess.deleteMany({
            where: { profileId: userId },
          });
        } else if (Array.isArray(campus_ids)) {
          await tx.userCampusAccess.deleteMany({
            where: { profileId: userId },
          });

          if (campus_ids.length > 0) {
            await tx.userCampusAccess.createMany({
              data: campus_ids.map((cid: string) => ({
                tenantId,
                profileId: userId,
                campusId: cid,
              })),
              skipDuplicates: true,
            });
          }
        }
      });

      // 5. Send Invite
      let inviteSent = false;
      if (sendInvite) {
        // D1: Use public origin
        const origin = getPublicAppOrigin(req);
        // B6: Use recovery type so it works for both new and existing users
        const redirectUrl = `${origin}/auth/callback?type=recovery&token=mock-token-${userId}`;

        // Mock Email Sending
        await EmailService.sendMail(
          normalizedEmail || "",
          "Activate your account", // Subject per B6
          `<p>You have been invited to join <strong>${(req as any).tenant?.name || "the organization"}</strong> on ERP.</p>
            <p>Set your password using the link below:</p>
            <p><a href="${redirectUrl}">Set Password</a></p>`,
        );
        inviteSent = true;
      }

      return res.status(alreadyExisted ? 200 : 201).json({
        profileId: userId,
        alreadyExisted,
        inviteSent,
      });
    } catch (err: any) {
      console.error(`UserController.createUser error: ${err.message}`);
      if (err.message.includes("Employee code")) {
        return res.status(409).json({ error: { message: err.message } });
      }
      return res
        .status(500)
        .json({ error: { message: "Failed to create user" } });
    }
  }

  /**
   * PATCH /api/admin/users/:id
   * Updates user details.
   */
  static async updateUser(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId;
      const requesterId = (req as any).user?.id;
      if (!tenantId) throw new Error("Tenant context missing");

      const { id } = req.params;
      const {
        full_name,
        role,
        all_campuses_access,
        campus_ids,
        employee,
        is_active,
      } = req.body;

      const userProfile = await prisma.profile.findUnique({ where: { id } });
      if (!userProfile || userProfile.tenantId !== tenantId) {
        return res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "User not found" } });
      }

      // C2: Platform Exclusion
      if (await isPlatformUser(userProfile.email || "")) {
        return res.status(409).json({
          error: {
            code: "PLATFORM_EMAIL_FORBIDDEN",
            message: "Platform users cannot be modified via tenant routes",
          },
        });
      }

      // B1: Role Normalization + Allowlist (if updating role)
      let roleUpper: string | undefined = undefined;
      if (role) {
        roleUpper = String(role).trim().toUpperCase();
        if (!ALLOWED_TENANT_ROLES.includes(roleUpper!)) {
          if (["ADMIN", "SUPER_ADMIN"].includes(roleUpper!)) {
            return res.status(403).json({
              error: {
                code: "ADMIN_ROLE_FORBIDDEN",
                message: "Cannot promote to ADMIN via this endpoint",
              },
            });
          }
          return res.status(400).json({
            error: {
              code: "INVALID_ROLE",
              message: `Role ${roleUpper} is not allowed.`,
            },
          });
        }
      }

      // C4: Self-protection
      if (id === requesterId) {
        if (is_active === false) {
          return res.status(409).json({
            error: {
              code: "SELF_LOCKOUT_FORBIDDEN",
              message: "You cannot deactivate your own account.",
            },
          });
        }
        if (
          all_campuses_access === false &&
          (!campus_ids || campus_ids.length === 0)
        ) {
          return res.status(409).json({
            error: {
              code: "SELF_LOCKOUT_FORBIDDEN",
              message: "You cannot remove all campus access from yourself.",
            },
          });
        }
      }

      // B3: Campus IDs must belong to tenant
      if (campus_ids && Array.isArray(campus_ids) && campus_ids.length > 0) {
        const validCount = await prisma.campus.count({
          where: {
            tenantId,
            id: { in: campus_ids },
          },
        });
        if (validCount !== campus_ids.length) {
          return res.status(404).json({
            error: {
              code: "CAMPUS_NOT_FOUND",
              message:
                "One or more provided campuses do not belong to this tenant.",
            },
          });
        }
      }

      // B4: Campus assignment rules (if updating role OR updating access)
      // We need effective role and effective access state to check.
      // Since partial updates are allowed, we need to merge with existing.
      const effectiveRole = roleUpper || userProfile.role;
      const effectiveAllAccess =
        all_campuses_access !== undefined
          ? all_campuses_access
          : userProfile.allCampusesAccess;

      // For campus_ids, if not provided in body, we should check existing?
      // Actually, if body doesn't contain campus_ids, we assume they aren't changing UNLESS all_campuses_access is changing?
      // If all_campuses_access becomes false, we expect campus_ids to be provided?
      // Or we check if existing + new is valid.
      // Simplified B4: If we are modifying access, we check.

      if (["TEACHER", "STUDENT", "STAFF"].includes(effectiveRole)) {
        // If we are explicitly setting access in this request:
        if (all_campuses_access !== undefined || campus_ids !== undefined) {
          if (effectiveAllAccess) {
            return res.status(400).json({
              error: {
                code: "CAMPUS_ACCESS_REQUIRED",
                message: `${effectiveRole} cannot have all-campus access.`,
              },
            });
          }
          // If all_campuses_access is false (or becoming false), we must have campus_ids.
          // If campus_ids is provided, it must be > 0.
          // If campus_ids is NOT provided, but we are switching to specific access, we rely on existing?
          // But usually the UI sends the whole set.
          // If campus_ids IS provided, it must be non-empty.
          if (campus_ids !== undefined) {
            if (!Array.isArray(campus_ids) || campus_ids.length === 0) {
              return res.status(400).json({
                error: {
                  code: "CAMPUS_ACCESS_REQUIRED",
                  message: `${effectiveRole} must be assigned to at least one campus.`,
                },
              });
            }
          } else if (
            all_campuses_access === false &&
            userProfile.allCampusesAccess === true
          ) {
            // Switching from All to Specific without providing IDs -> Invalid state transition usually implies empty list?
            // Or user keeps existing (which are none since it was All).
            // So we fail if no IDs provided.
            return res.status(400).json({
              error: {
                code: "CAMPUS_ACCESS_REQUIRED",
                message: `Please select campuses for ${effectiveRole}.`,
              },
            });
          }
        } else if (roleUpper && roleUpper !== userProfile.role) {
          // Changing Role to Restricted Role. Must verify existing access or demand new access.
          // If existing user has All Access, we must fail.
          if (userProfile.allCampusesAccess) {
            return res.status(400).json({
              error: {
                code: "CAMPUS_ACCESS_REQUIRED",
                message: `Role ${effectiveRole} requires specific campus assignment. Please update access.`,
              },
            });
          }
          // If existing user has specific access, check if it has any campuses.
          const existingCount = await prisma.userCampusAccess.count({
            where: { profileId: id },
          });
          if (existingCount === 0) {
            return res.status(400).json({
              error: {
                code: "CAMPUS_ACCESS_REQUIRED",
                message: `Role ${effectiveRole} requires at least one campus.`,
              },
            });
          }
        }
      }

      // Validate Campus Mix for Restricted Roles
      if (campus_ids && campus_ids.length > 1) {
        if (["TEACHER", "STAFF"].includes(effectiveRole)) {
          const selectedCampuses = await prisma.campus.findMany({
            where: { id: { in: campus_ids } },
            select: { campusType: true },
          });
          const types = new Set(selectedCampuses.map((c) => c.campusType));
          if (types.has("SCHOOL") && types.has("PU")) {
            return res.status(409).json({
              error: {
                code: "CROSS_TYPE_ASSIGNMENT_FORBIDDEN",
                message:
                  "Teachers and Staff cannot be assigned to both School and College campuses.",
              },
            });
          }
        }
      }

      await prisma.$transaction(async (tx) => {
        // Update Profile
        const updateData: any = {};
        if (full_name) updateData.fullName = full_name;
        if (roleUpper) updateData.role = roleUpper;
        if (all_campuses_access !== undefined)
          updateData.allCampusesAccess = !!all_campuses_access;
        if (is_active !== undefined) updateData.isActive = is_active;

        if (Object.keys(updateData).length > 0) {
          await tx.profile.update({
            where: { id },
            data: updateData,
          });
        }

        // Update Employee
        if (employee) {
          await tx.employee.upsert({
            where: { profileId: id },
            create: {
              tenantId,
              profileId: id,
              employeeCode: employee.employee_code,
              phone: employee.phone,
              designation: employee.designation,
              department: employee.department,
              joinedOn: employee.joined_on
                ? new Date(employee.joined_on)
                : null,
            },
            update: {
              employeeCode: employee.employee_code,
              phone: employee.phone,
              designation: employee.designation,
              department: employee.department,
              joinedOn: employee.joined_on
                ? new Date(employee.joined_on)
                : null,
            },
          });
        }

        // Update Campus Access
        if (all_campuses_access === true) {
          await tx.userCampusAccess.deleteMany({ where: { profileId: id } });
        } else if (campus_ids && Array.isArray(campus_ids)) {
          await tx.userCampusAccess.deleteMany({ where: { profileId: id } });
          if (campus_ids.length > 0) {
            await tx.userCampusAccess.createMany({
              data: campus_ids.map((cid: string) => ({
                tenantId,
                profileId: id,
                campusId: cid,
              })),
              skipDuplicates: true,
            });
          }
        }
      });

      const updated = await prisma.profile.findUnique({
        where: { id },
        include: {
          employee: true,
          campusAccess: { include: { campus: true } },
        },
      });
      if (!updated)
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to load updated user",
          },
        });
      const out = {
        id: updated.id,
        email: updated.email,
        full_name: updated.fullName,
        fullName: updated.fullName,
        role: updated.role,
        is_active: updated.isActive,
        isActive: updated.isActive,
        all_campuses_access: updated.allCampusesAccess,
        allCampusesAccess: updated.allCampusesAccess,
        campus_ids: updated.campusAccess.map((ca) => ca.campusId),
        campusAccess: updated.campusAccess.map((ca) => ({
          campus: {
            id: ca.campus.id,
            name: ca.campus.name,
            campusType: ca.campus.campusType,
          },
        })),
        employee: updated.employee
          ? {
              employee_code: updated.employee.employeeCode,
              employeeCode: updated.employee.employeeCode,
              phone: updated.employee.phone,
              designation: updated.employee.designation,
              department: updated.employee.department,
              joined_on:
                updated.employee.joinedOn?.toISOString?.()?.slice(0, 10) ??
                null,
              joinedOn: updated.employee.joinedOn,
            }
          : null,
        last_login_at: updated.lastLoginAt?.toISOString?.() ?? null,
        lastLoginAt: updated.lastLoginAt,
        created_at: updated.createdAt?.toISOString?.() ?? null,
        createdAt: updated.createdAt,
      };
      return res.json(out);
    } catch (err: any) {
      console.error(`UserController.updateUser error: ${err.message}`);
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to update user" },
      });
    }
  }

  /**
   * POST /api/admin/users/:id/resend-invite
   */
  static async resendInvite(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId;
      if (!tenantId) throw new Error("Tenant context missing");

      const { id } = req.params;
      const userProfile = await prisma.profile.findUnique({ where: { id } });

      if (!userProfile || userProfile.tenantId !== tenantId) {
        return res.status(404).json({ error: { message: "User not found" } });
      }

      // C2: Platform Exclusion
      if (await isPlatformUser(userProfile.email || "")) {
        return res.status(409).json({
          error: {
            code: "PLATFORM_EMAIL_FORBIDDEN",
            message: "Cannot send invite to platform users",
          },
        });
      }

      // D1: Get public origin
      const origin = getPublicAppOrigin(req);
      // D2: Always generateLink type="recovery"
      const redirectUrl = `${origin}/auth/callback?type=recovery&token=mock-token-${id}`;

      // D3: Subject: "Activate your account"
      await EmailService.sendMail(
        userProfile.email || "",
        "Activate your account",
        `<p>You have been invited to join ERP.</p>
        <p><a href="${redirectUrl}">Set Password</a></p>`,
      );

      return res.json({ inviteSent: true });
    } catch (err: any) {
      console.error(`UserController.resendInvite error: ${err.message}`);
      return res
        .status(500)
        .json({ error: { message: "Failed to resend invite" } });
    }
  }

  /**
   * POST /api/admin/users/:id/reset-password
   */
  static async resetPassword(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId;
      if (!tenantId) throw new Error("Tenant context missing");

      const { id } = req.params;
      const userProfile = await prisma.profile.findUnique({ where: { id } });

      if (!userProfile || userProfile.tenantId !== tenantId) {
        return res.status(404).json({ error: { message: "User not found" } });
      }

      // C2: Platform Exclusion
      if (await isPlatformUser(userProfile.email || "")) {
        return res.status(409).json({
          error: {
            code: "PLATFORM_EMAIL_FORBIDDEN",
            message:
              "Cannot reset password for platform users via tenant portal",
          },
        });
      }

      // D1: Get public origin
      const origin = getPublicAppOrigin(req);
      // D2: Always generateLink type="recovery"
      const redirectUrl = `${origin}/auth/callback?type=recovery&token=mock-token-${id}`;

      // D3: Subject: "Reset your password"
      await EmailService.sendMail(
        userProfile.email || "",
        "Reset your password",
        `<p>Reset your password using the link below:</p>
        <p><a href="${redirectUrl}">Reset Password</a></p>`,
      );

      return res.json({ sent: true });
    } catch (err: any) {
      console.error(`UserController.resetPassword error: ${err.message}`);
      return res
        .status(500)
        .json({ error: { message: "Failed to send reset link" } });
    }
  }
}
