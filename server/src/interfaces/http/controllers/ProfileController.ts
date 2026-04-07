import { Request, Response } from "express";
import prisma, { runWithTenantContext } from "../../../infrastructure/prisma/client";
import { AuditLogger } from "../../../services/AuditLogger";
import {
  buildMediaKey,
  deleteMediaObject,
  resolveMediaUrl,
  uploadMediaObject,
} from "../../../infrastructure/aws/s3-media";

function getProfileContext(req: Request) {
  const tenantId = (req as any).tenant?.tenantId as string | undefined;
  const profileId = (req as any).user?.id as string | undefined;
  const authUserId = (req as any).auth?.authUserId as string | undefined;
  const campusId = (req as any).campus?.campusId as string | undefined;

  if (!tenantId || !profileId || !authUserId) {
    const error: any = new Error("Profile context missing");
    error.statusCode = 400;
    throw error;
  }

  return { tenantId, profileId, authUserId, campusId };
}

export class ProfileController {
  static async getMyProfile(req: Request, res: Response) {
    try {
      const { tenantId, profileId, authUserId, campusId } = getProfileContext(req);

      const result = await runWithTenantContext(tenantId, authUserId, async (db) => {
        const [profile, employee, tenant] = await Promise.all([
          db.profile.findUnique({
            where: { id: profileId },
          }),
          db.employee.findUnique({
            where: { profileId },
          }),
          db.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true, slug: true, logoUrl: true, logoKey: true },
          }),
        ]);

        return { profile, employee, tenant };
      });

      if (!result.profile || !result.tenant) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "Profile not found" },
        });
      }

      const [avatarUrl, tenantLogoUrl] = await Promise.all([
        resolveMediaUrl(result.profile.avatarKey, result.profile.avatarUrl),
        resolveMediaUrl(result.tenant.logoKey, result.tenant.logoUrl),
      ]);

      return res.json({
        profile: {
          id: result.profile.id,
          email: result.profile.email,
          full_name: result.profile.fullName,
          role: result.profile.role,
          avatar_url: avatarUrl,
          campus_id: campusId ?? null,
        },
        employee: result.employee
          ? {
              phone: result.employee.phone,
              designation: result.employee.designation,
              department: result.employee.department,
            }
          : null,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          logo_url: tenantLogoUrl,
        },
      });
    } catch (error: any) {
      console.error("ProfileController.getMyProfile error:", error);
      return res.status(error?.statusCode || 500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to fetch profile",
        },
      });
    }
  }

  static async updateMyProfile(req: Request, res: Response) {
    try {
      const { tenantId, profileId, authUserId } = getProfileContext(req);
      const { full_name, phone, designation, department } = req.body ?? {};

      const updated = await runWithTenantContext(tenantId, authUserId, async (db) => {
        const profile = await db.profile.update({
          where: { id: profileId },
          data: {
            ...(full_name !== undefined ? { fullName: String(full_name).trim() } : {}),
          },
        });

        const employee =
          phone !== undefined || designation !== undefined || department !== undefined
            ? await db.employee.upsert({
                where: { profileId },
                create: {
                  tenantId,
                  profileId,
                  phone: phone || null,
                  designation: designation || null,
                  department: department || null,
                },
                update: {
                  ...(phone !== undefined ? { phone: phone || null } : {}),
                  ...(designation !== undefined ? { designation: designation || null } : {}),
                  ...(department !== undefined ? { department: department || null } : {}),
                },
              })
            : await db.employee.findUnique({ where: { profileId } });

        return { profile, employee };
      });

      const avatarUrl = await resolveMediaUrl(
        updated.profile.avatarKey,
        updated.profile.avatarUrl,
      );

      await AuditLogger.logAction({
        actorId: authUserId,
        action: "UPDATE_PROFILE",
        targetType: "profile",
        targetId: profileId,
        tenantId,
        after: {
          full_name: updated.profile.fullName,
          phone: updated.employee?.phone || null,
          designation: updated.employee?.designation || null,
          department: updated.employee?.department || null,
        },
      });

      return res.json({
        profile: {
          id: updated.profile.id,
          email: updated.profile.email,
          full_name: updated.profile.fullName,
          avatar_url: avatarUrl,
        },
        employee: updated.employee
          ? {
              phone: updated.employee.phone,
              designation: updated.employee.designation,
              department: updated.employee.department,
            }
          : null,
      });
    } catch (error: any) {
      console.error("ProfileController.updateMyProfile error:", error);
      return res.status(error?.statusCode || 500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to update profile",
        },
      });
    }
  }

  static async uploadAvatar(req: Request, res: Response) {
    try {
      const { tenantId, profileId, authUserId, campusId } = getProfileContext(req);
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({
          error: { code: "FILE_REQUIRED", message: "Image file is required" },
        });
      }

      const current = await prisma.profile.findUnique({
        where: { id: profileId },
        select: { avatarKey: true },
      });

      const key = buildMediaKey({
        tenantId,
        campusId,
        userId: profileId,
        scope: "profile",
        kind: "avatar",
        filename: file.originalname,
      });

      const uploaded = await uploadMediaObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });

      await prisma.profile.update({
        where: { id: profileId },
        data: {
          avatarKey: uploaded.key,
          avatarUrl: uploaded.storageUrl,
        },
      });

      await deleteMediaObject(current?.avatarKey);

      await AuditLogger.logAction({
        actorId: authUserId,
        action: "UPLOAD_PROFILE_AVATAR",
        targetType: "profile",
        targetId: profileId,
        tenantId,
        campusId,
        after: { avatar_key: uploaded.key },
      });

      return res.json({ avatar_url: uploaded.signedUrl });
    } catch (error: any) {
      console.error("ProfileController.uploadAvatar error:", error);
      return res.status(error?.statusCode || 500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to upload avatar",
        },
      });
    }
  }

  static async uploadTenantLogo(req: Request, res: Response) {
    try {
      const { tenantId, profileId, authUserId, campusId } = getProfileContext(req);
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({
          error: { code: "FILE_REQUIRED", message: "Image file is required" },
        });
      }

      const currentTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { logoKey: true },
      });

      const key = buildMediaKey({
        tenantId,
        campusId,
        userId: profileId,
        scope: "branding",
        kind: "logo",
        filename: file.originalname,
      });

      const uploaded = await uploadMediaObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          logoKey: uploaded.key,
          logoUrl: uploaded.storageUrl,
        },
      });

      await deleteMediaObject(currentTenant?.logoKey);

      await AuditLogger.logAction({
        actorId: authUserId,
        action: "UPLOAD_TENANT_LOGO",
        targetType: "tenant",
        targetId: tenantId,
        tenantId,
        campusId,
        after: { logo_key: uploaded.key },
      });

      return res.json({ logo_url: uploaded.signedUrl });
    } catch (error: any) {
      console.error("ProfileController.uploadTenantLogo error:", error);
      return res.status(error?.statusCode || 500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to upload tenant logo",
        },
      });
    }
  }
}
