import { randomBytes } from "crypto";
import { Request, Response } from "express";
import { PublishedResultFileType } from "@prisma/client";
import prisma from "../../../infrastructure/prisma/client";
import {
  buildPublishedResultKey,
  getSignedMediaUrl,
  uploadMediaObject,
} from "../../../infrastructure/aws/s3-media";
import { AuditLogger } from "../../../services/AuditLogger";

function getAcademicYearFilter(req: Request): string | undefined {
  const queryYear = req.query.academicYear as string | undefined;
  const headerYear = req.headers["x-academic-year"];
  if (queryYear?.trim()) return queryYear.trim();
  if (typeof headerYear === "string" && headerYear.trim()) return headerYear.trim();
  return undefined;
}

function detectFileType(file: Express.Multer.File): PublishedResultFileType {
  const lowerName = file.originalname.toLowerCase();
  if (file.mimetype === "application/pdf" || lowerName.endsWith(".pdf")) {
    return PublishedResultFileType.PDF;
  }
  return PublishedResultFileType.EXCEL;
}

function buildPublicToken() {
  return randomBytes(16).toString("hex");
}

function getUploadContext(req: Request) {
  const tenantId = (req as any).tenant?.tenantId as string | undefined;
  const campusId = (req as any).campus?.campusId as string | undefined;
  const profileId = (req as any).user?.id as string | undefined;
  const authUserId = (req as any).auth?.authUserId as string | undefined;

  if (!tenantId || !campusId || !profileId || !authUserId) {
    const error: any = new Error("Results upload context missing");
    error.statusCode = 400;
    throw error;
  }

  return { tenantId, campusId, profileId, authUserId };
}

function mapBatch(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    campusId: row.campusId,
    academicYear: row.academicYear,
    className: row.className,
    sectionName: row.sectionName,
    examName: row.examName,
    title: row.title,
    fileType: row.fileType,
    fileName: row.fileName,
    isPublished: row.isPublished,
    publicToken: row.publicToken,
    publishedAt: row.publishedAt,
    uploadedAt: row.uploadedAt,
    uploadedBy: row.uploadedBy
      ? {
          id: row.uploadedBy.id,
          fullName: row.uploadedBy.fullName,
          email: row.uploadedBy.email,
        }
      : null,
  };
}

export class ResultsController {
  static async createBatch(req: Request, res: Response) {
    try {
      const { tenantId, campusId, profileId, authUserId } = getUploadContext(req);
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({
          error: { code: "FILE_REQUIRED", message: "Result file is required" },
        });
      }

      const academicYear =
        String(req.body?.academicYear || "").trim() || getAcademicYearFilter(req);
      const className = String(req.body?.className || "").trim();
      const sectionName = String(req.body?.sectionName || "").trim();
      const examName = String(req.body?.examName || "").trim();
      const title =
        String(req.body?.title || "").trim() ||
        `${className} ${sectionName} - ${examName}`.trim();
      const publish =
        req.body?.publish === true ||
        req.body?.publish === "true" ||
        req.body?.publish === "1";

      if (!academicYear || !className || !sectionName || !examName) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "academicYear, className, sectionName, and examName are required",
          },
        });
      }

      const fileType = detectFileType(file);
      const key = buildPublishedResultKey({
        tenantId,
        campusId,
        userId: profileId,
        academicYear,
        className,
        sectionName,
        examName,
        filename: file.originalname,
      });

      const uploaded = await uploadMediaObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });

      const batch = await prisma.publishedResultBatch.create({
        data: {
          tenantId,
          campusId,
          academicYear,
          className,
          sectionName,
          examName,
          title,
          fileType,
          fileKey: uploaded.key,
          fileName: file.originalname,
          fileUrl: uploaded.storageUrl,
          isPublished: publish,
          publicToken: buildPublicToken(),
          uploadedByProfileId: profileId,
          publishedAt: publish ? new Date() : null,
        },
        include: {
          uploadedBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await AuditLogger.logAction({
        actorId: authUserId,
        action: "CREATE_PUBLISHED_RESULT_BATCH",
        targetType: "published_result_batch",
        targetId: batch.id,
        tenantId,
        campusId,
        after: {
          academicYear,
          className,
          sectionName,
          examName,
          fileType,
          isPublished: publish,
        },
      });

      return res.status(201).json({
        ...mapBatch(batch),
        fileUrl: await getSignedMediaUrl(batch.fileKey),
      });
    } catch (error: any) {
      return res.status(error?.statusCode || 500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to create result batch",
        },
      });
    }
  }

  static async listBatches(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const academicYear = getAcademicYearFilter(req);

      const rows = await prisma.publishedResultBatch.findMany({
        where: {
          tenantId,
          ...(campusId ? { campusId } : {}),
          ...(academicYear ? { academicYear } : {}),
        },
        orderBy: { uploadedAt: "desc" },
        include: {
          uploadedBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      const data = await Promise.all(
        rows.map(async (row) => ({
          ...mapBatch(row),
          fileUrl: await getSignedMediaUrl(row.fileKey),
        })),
      );

      return res.json({ data });
    } catch (error: any) {
      return res.status(500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to list result batches",
        },
      });
    }
  }

  static async updatePublishStatus(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      const { id } = req.params;
      const publish =
        req.body?.publish === true ||
        req.body?.publish === "true" ||
        req.body?.publish === "1";

      const batch = await prisma.publishedResultBatch.updateMany({
        where: {
          id,
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
        data: {
          isPublished: publish,
          publishedAt: publish ? new Date() : null,
        },
      });

      if (!batch.count) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "Result batch not found" },
        });
      }

      const updated = await prisma.publishedResultBatch.findUnique({
        where: { id },
        include: {
          uploadedBy: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      if (authUserId && updated) {
        await AuditLogger.logAction({
          actorId: authUserId,
          action: publish ? "PUBLISH_RESULT_BATCH" : "UNPUBLISH_RESULT_BATCH",
          targetType: "published_result_batch",
          targetId: updated.id,
          tenantId: updated.tenantId,
          campusId: updated.campusId,
          after: { isPublished: publish },
        });
      }

      return res.json({
        ...mapBatch(updated),
        fileUrl: updated ? await getSignedMediaUrl(updated.fileKey) : null,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to update publish status",
        },
      });
    }
  }

  static async getPublicBatch(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const batch = await prisma.publishedResultBatch.findUnique({
        where: { publicToken: token },
        include: {
          tenant: {
            select: { id: true, name: true, logoKey: true, logoUrl: true },
          },
          campus: {
            select: { id: true, name: true },
          },
        },
      });

      if (!batch || !batch.isPublished) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "Published result not found" },
        });
      }

      return res.json({
        id: batch.id,
        academicYear: batch.academicYear,
        className: batch.className,
        sectionName: batch.sectionName,
        examName: batch.examName,
        title: batch.title,
        fileType: batch.fileType,
        fileName: batch.fileName,
        publishedAt: batch.publishedAt,
        tenant: {
          id: batch.tenant.id,
          name: batch.tenant.name,
          logoUrl: batch.tenant.logoKey
            ? await getSignedMediaUrl(batch.tenant.logoKey)
            : batch.tenant.logoUrl,
        },
        campus: batch.campus,
        fileUrl: await getSignedMediaUrl(batch.fileKey),
      });
    } catch (error: any) {
      return res.status(500).json({
        error: {
          code: error?.code || "INTERNAL_ERROR",
          message: error?.message || "Failed to fetch published result",
        },
      });
    }
  }
}
