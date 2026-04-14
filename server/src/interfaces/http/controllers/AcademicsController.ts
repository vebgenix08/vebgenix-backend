import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";

// ─── Classes ─────────────────────────────────────────────────────────────────

export async function listClasses(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { programId } = req.query;

    const classes = await prisma.class.findMany({
      where: {
        program: { tenantId },
        ...(programId ? { programId: programId as string } : {}),
      },
      include: {
        program: { select: { id: true, name: true, type: true } },
        sections: { orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return res.json({ classes });
  } catch (err: any) {
    console.error("[AcademicsController] listClasses:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createClass(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { programId, name } = req.body;
    if (!programId || !name) {
      return res.status(400).json({ error: "programId and name are required" });
    }

    const program = await prisma.program.findFirst({ where: { id: programId, tenantId } });
    if (!program) return res.status(404).json({ error: "Program not found" });

    const cls = await prisma.class.create({
      data: { programId, name },
      include: { program: { select: { id: true, name: true, type: true } }, sections: true },
    });
    return res.status(201).json({ class: cls });
  } catch (err: any) {
    console.error("[AcademicsController] createClass:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function updateClass(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { classId } = req.params;
    const { name, programId } = req.body;

    const existing = await prisma.class.findFirst({
      where: { id: classId, program: { tenantId } },
    });
    if (!existing) return res.status(404).json({ error: "Class not found" });

    const cls = await prisma.class.update({
      where: { id: classId },
      data: {
        ...(name !== undefined && { name }),
        ...(programId !== undefined && { programId }),
      },
      include: { program: { select: { id: true, name: true, type: true } }, sections: true },
    });
    return res.json({ class: cls });
  } catch (err: any) {
    console.error("[AcademicsController] updateClass:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteClass(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { classId } = req.params;
    const existing = await prisma.class.findFirst({
      where: { id: classId, program: { tenantId } },
    });
    if (!existing) return res.status(404).json({ error: "Class not found" });

    await prisma.class.delete({ where: { id: classId } });
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error("[AcademicsController] deleteClass:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Sections ────────────────────────────────────────────────────────────────

export async function listSections(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { classId } = req.params;

    const cls = await prisma.class.findFirst({ where: { id: classId, program: { tenantId } } });
    if (!cls) return res.status(404).json({ error: "Class not found" });

    const sections = await prisma.section.findMany({
      where: { classId },
      include: { campus: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
    return res.json({ sections });
  } catch (err: any) {
    console.error("[AcademicsController] listSections:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createSection(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { classId } = req.params;
    const { name, campusId } = req.body;
    if (!name || !campusId) {
      return res.status(400).json({ error: "name and campusId are required" });
    }

    const cls = await prisma.class.findFirst({ where: { id: classId, program: { tenantId } } });
    if (!cls) return res.status(404).json({ error: "Class not found" });

    const section = await prisma.section.create({
      data: { classId, campusId, name },
      include: { campus: { select: { id: true, name: true } } },
    });
    return res.status(201).json({ section });
  } catch (err: any) {
    console.error("[AcademicsController] createSection:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function updateSection(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { classId, sectionId } = req.params;
    const { name, campusId } = req.body;

    const existing = await prisma.section.findFirst({
      where: { id: sectionId, classId, class: { program: { tenantId } } },
    });
    if (!existing) return res.status(404).json({ error: "Section not found" });

    const section = await prisma.section.update({
      where: { id: sectionId },
      data: {
        ...(name !== undefined && { name }),
        ...(campusId !== undefined && { campusId }),
      },
      include: { campus: { select: { id: true, name: true } } },
    });
    return res.json({ section });
  } catch (err: any) {
    console.error("[AcademicsController] updateSection:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteSection(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { classId, sectionId } = req.params;
    const existing = await prisma.section.findFirst({
      where: { id: sectionId, classId, class: { program: { tenantId } } },
    });
    if (!existing) return res.status(404).json({ error: "Section not found" });

    await prisma.section.delete({ where: { id: sectionId } });
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error("[AcademicsController] deleteSection:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Subjects ────────────────────────────────────────────────────────────────

export async function listSubjects(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const subjects = await prisma.subject.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return res.json({ subjects });
  } catch (err: any) {
    console.error("[AcademicsController] listSubjects:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createSubject(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { name, code, description } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const subject = await prisma.subject.create({
      data: { tenantId, name, code: code || null, description: description || null },
    });
    return res.status(201).json({ subject });
  } catch (err: any) {
    console.error("[AcademicsController] createSubject:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function updateSubject(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { subjectId } = req.params;
    const { name, code, description } = req.body;

    const existing = await prisma.subject.findFirst({ where: { id: subjectId, tenantId } });
    if (!existing) return res.status(404).json({ error: "Subject not found" });

    const subject = await prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(description !== undefined && { description }),
      },
    });
    return res.json({ subject });
  } catch (err: any) {
    console.error("[AcademicsController] updateSubject:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteSubject(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { subjectId } = req.params;
    const existing = await prisma.subject.findFirst({ where: { id: subjectId, tenantId } });
    if (!existing) return res.status(404).json({ error: "Subject not found" });

    await prisma.subject.delete({ where: { id: subjectId } });
    return res.json({ deleted: true });
  } catch (err: any) {
    console.error("[AcademicsController] deleteSubject:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Student Class Assignment ─────────────────────────────────────────────────

export async function assignStudentClass(req: Request, res: Response) {
  try {
    const tenantId = (req as any).auth?.tenantId;
    if (!tenantId) return res.status(403).json({ error: "Tenant context required" });

    const { studentId } = req.params;
    const { classId, sectionId } = req.body;

    const student = await prisma.student.findFirst({ where: { id: studentId, tenantId } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    if (classId) {
      const cls = await prisma.class.findFirst({ where: { id: classId, program: { tenantId } } });
      if (!cls) return res.status(404).json({ error: "Class not found" });
    }
    if (sectionId) {
      const sec = await prisma.section.findFirst({
        where: { id: sectionId, class: { program: { tenantId } } },
      });
      if (!sec) return res.status(404).json({ error: "Section not found" });
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        classId: classId ?? null,
        sectionId: sectionId ?? null,
      },
    });
    return res.json({ student: updated });
  } catch (err: any) {
    console.error("[AcademicsController] assignStudentClass:", err);
    return res.status(500).json({ error: err.message });
  }
}
