import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";

// ─── Academic Years ─────────────────────────────────────────────────────────

export async function listAcademicYears(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const years = await prisma.academicYear.findMany({
      where: { tenantId },
      orderBy: { startDate: "desc" },
    });

    return res.json({ academicYears: years });
  } catch (err: any) {
    console.error("[SettingsController] listAcademicYears:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createAcademicYear(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ error: "name, startDate, endDate are required" });
    }

    const year = await prisma.academicYear.create({
      data: {
        tenantId,
        name,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });

    return res.status(201).json({ academicYear: year });
  } catch (err: any) {
    console.error("[SettingsController] createAcademicYear:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Programs ───────────────────────────────────────────────────────────────

export async function listPrograms(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const programs = await prisma.program.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });

    return res.json({ programs });
  } catch (err: any) {
    console.error("[SettingsController] listPrograms:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createProgram(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { name, type } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const program = await prisma.program.create({
      data: { tenantId, name, type: type ?? null },
    });

    return res.status(201).json({ program });
  } catch (err: any) {
    console.error("[SettingsController] createProgram:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Templates ──────────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const type = req.query.type as string | undefined;

    const templates = await prisma.template.findMany({
      where: {
        tenantId,
        ...(type ? { type: type as any } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });

    const result = templates.map((t: any) => ({
      id: t.id,
      type: t.type,
      name: t.name,
      latestVersion: t.versions[0] ?? null,
      versions: t.versions,
    }));

    return res.json({ templates: result });
  } catch (err: any) {
    console.error("[SettingsController] listTemplates:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createTemplate(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { type, name } = req.body;
    if (!type || !name) return res.status(400).json({ error: "type and name are required" });

    const template = await prisma.template.create({
      data: { tenantId, type: type as any, name },
    });

    return res.status(201).json({
      template: { ...template, latestVersion: null, versions: [] },
    });
  } catch (err: any) {
    console.error("[SettingsController] createTemplate:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function publishTemplateVersion(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { templateId } = req.params;
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: "content is required" });

    // Verify template belongs to tenant
    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template || template.tenantId !== tenantId) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Find latest version number
    const latest = await prisma.templateVersion.findFirst({
      where: { templateId },
      orderBy: { version: "desc" },
    });

    const newVersionNum = (latest?.version ?? 0) + 1;

    const version = await prisma.templateVersion.create({
      data: {
        templateId,
        version: newVersionNum,
        content,
        isPublished: true,
      },
    });

    return res.status(201).json({ version });
  } catch (err: any) {
    console.error("[SettingsController] publishTemplateVersion:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { templateId } = req.params;

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template || template.tenantId !== tenantId) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Delete versions first, then template
    await prisma.templateVersion.deleteMany({ where: { templateId } });
    await prisma.template.delete({ where: { id: templateId } });

    return res.json({ deleted: true });
  } catch (err: any) {
    console.error("[SettingsController] deleteTemplate:", err);
    return res.status(500).json({ error: err.message });
  }
}
