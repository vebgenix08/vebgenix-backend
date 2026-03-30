import { Request, Response } from "express";
import prisma, { runWithTenantContext } from "../../../infrastructure/prisma/client";
import { EmailService } from "../../../infrastructure/services/emailService";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { TemplateType } from "@prisma/client";

const APP_BASE_URL = process.env.FRONTEND_URL || "https://app.vebgenix.com";
const ADMIN_FALLBACK_EMAIL =
  process.env.ADMIN_FALLBACK_EMAIL || "dhanushags1567@gmail.com";
const ANON_USER_ID = "00000000-0000-0000-0000-000000000000";

// Email validation: simple regex for email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const DEFAULT_CERTIFICATE_TEMPLATES = [
  {
    key: "study_certificate",
    name: "Study Certificate",
    sections: {
      header: "To whomsoever it may concern,",
      body:
        "This is to certify that {{student_name}}, bearing registration number {{reg_no}}, is a student of this institution studying in {{current_year}} under the {{program_name}} programme during the academic year {{academic_year}}.",
      footer: "This certificate is issued on the student's request for official academic use.",
      signature: "Authorised Signatory",
    },
  },
  {
    key: "bonafide_certificate",
    name: "Bonafide Certificate",
    sections: {
      header: "To whomsoever it may concern,",
      body:
        "This is to certify that {{student_name}}, bearing registration number {{usn}}, is a bonafide student of this institution studying in {{current_year}} under the {{program_name}} programme during the academic year {{academic_year}}.",
      footer: "This certificate is issued for the purpose of {{certificate_purpose}}.",
      signature: "Authorised Signatory",
    },
  },
  {
    key: "undertaking_certificate",
    name: "Undertaking Certificate",
    sections: {
      header: "Undertaking by Student and Parent / Guardian",
      body:
        "I, {{student_name}}, accept admission to {{current_year}} under the {{program_name}} programme through the {{quota}} quota for the academic year {{admission_year}}. I, along with my parent / guardian {{father_name}}, acknowledge that a seat vacated after the final admission date may remain vacant for the rest of the course. We therefore undertake to comply with the institutional fee obligations if the seat is surrendered during the course period.",
      footer: "",
      signature: "Student / Parent / Guardian",
    },
  },
  {
    key: "tc_application_certificate",
    name: "TC Application Certificate",
    sections: {
      header: "Transfer Certificate Request",
      body:
        "I have been admitted to the {{program_name}} programme at {{institution_name}}, subject to the submission of my Transfer Certificate. I request that my original Transfer Certificate be forwarded to The Principal, {{institution_name}}, {{institution_city}}, {{institution_state}} - {{institution_postal_code}}.",
      footer: "If any dues remain pending with the previous institution, the same may kindly be communicated to the student.",
      signature: "Student Signature",
    },
  },
];

type CertificateTemplate = {
  key: string;
  name: string;
  sections: {
    header: string;
    body: string;
    footer: string;
    signature: string;
  };
};

async function loadCertificateTemplates(
  tenantId: string,
  authUserId: string,
): Promise<CertificateTemplate[]> {
  const templates = await runWithTenantContext(tenantId, authUserId, (db) =>
    db.template.findMany({
      where: {
        tenantId,
        type: TemplateType.COMMUNICATION,
      },
      include: {
        versions: {
          orderBy: [{ version: "desc" }],
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
  );

  const tenantTemplates = templates
    .map((template) => {
      const content = template.versions[0]?.content as Record<string, unknown> | undefined;
      if (!content || content.kind !== "certificate") {
        return null;
      }

      const key = String(content.key || "").trim();
      const name = String(content.name || template.name || "").trim();
      const rawSections =
        content.sections && typeof content.sections === "object"
          ? (content.sections as Record<string, unknown>)
          : null;
      const fallback = DEFAULT_CERTIFICATE_TEMPLATES.find((item) => item.key === key) ?? null;
      const sections = {
        header: String(rawSections?.header || fallback?.sections.header || "").trim(),
        body: String(rawSections?.body || content.body || fallback?.sections.body || "").trim(),
        footer: String(rawSections?.footer || fallback?.sections.footer || "").trim(),
        signature: String(rawSections?.signature || fallback?.sections.signature || "Authorised Signatory").trim(),
      };
      if (!key || !name || !sections.body) {
        return null;
      }

      return { key, name, sections };
    })
    .filter((item): item is CertificateTemplate => Boolean(item));

  return tenantTemplates.length > 0 ? tenantTemplates : DEFAULT_CERTIFICATE_TEMPLATES;
}

function renderCertificateTemplateSection(template: string, context: Record<string, string>) {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key) => context[key.trim()] ?? "");
}

function renderCertificateSections(
  sections: CertificateTemplate["sections"],
  context: Record<string, string>,
) {
  return {
    header: renderCertificateTemplateSection(sections.header || "", context),
    body: renderCertificateTemplateSection(sections.body || "", context),
    footer: renderCertificateTemplateSection(sections.footer || "", context),
    signature: renderCertificateTemplateSection(sections.signature || "", context),
  };
}

function composeRenderedCertificateContent(
  sections: ReturnType<typeof renderCertificateSections>,
) {
  return [sections.header, sections.body, sections.footer].filter(Boolean).join("\n\n");
}

export class StudentController {
  /**
   * GET /api/admin/students
   * Fetch all students with pagination, search, and filtering
   */
  static async getAllStudents(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const allCampusesAccess = (req as any).user?.allCampusesAccess === true;

      if (!tenantId || !authUserId) {
        return res.status(400).json({ error: { message: "Tenant context missing" } });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || "";
      const status = (req.query.status as string) || "all";
      const campusScope = (req.query.scope as string) || "All"; // School, PU, or All
      const academicYear = (req.query.academicYear as string) || "";

      const skip = (page - 1) * limit;

      // Build Where Clause
      const where: any = { tenantId };

      if (!allCampusesAccess && campusId) {
        where.campusId = campusId;
      }

      if (academicYear) {
        where.application = {
          academicYear,
        };
      }

      // 1. Search (Name, RegNo, Email, Phone)
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: "insensitive" } },
          { registrationNumber: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { parentPhone: { contains: search, mode: "insensitive" } },
        ];
      }

      // 2. Status Filter
      if (status !== "all") {
        where.status = status.toUpperCase();
      }

      // 3. Campus Scope Filter
      if (campusScope === "School") {
        where.campusType = "SCHOOL";
      } else if (campusScope === "PU") {
        where.campusType = "PU";
      }

      // Execute Queries in Parallel
      const [students, total, statusCounts] = await runWithTenantContext(tenantId, authUserId, async (db) => {
        return Promise.all([
          db.student.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              registrationNumber: true,
              fullName: true,
              email: true,
              parentPhone: true,
              status: true,
              campusType: true,
              currentGrade: true,
              currentSection: true,
              stream: true,
              application: {
                select: {
                  academicYear: true,
                  gradeApplyingFor: true,
                },
              },
            },
          }),
          db.student.count({ where }),
          db.student.groupBy({
            by: ["status"],
            where,
            _count: { status: true },
          }),
        ]);
      });

      // Map response to match frontend interface
      const formattedStudents = students.map((s) => ({
        _id: s.id,
        registrationNumber: s.registrationNumber,
        fullName: s.fullName,
        firstName: s.fullName.split(" ")[0], // Approx
        lastName: s.fullName.split(" ").slice(1).join(" "), // Approx
        email: s.email || "",
        phone: s.parentPhone || "", // Mapped from parentPhone
        status: s.status,
        campusType: s.campusType, // New field explicitly for frontend knowledge
        term: "2024-25", // Dummy/Default for now if not in DB
        program: s.application?.gradeApplyingFor || (s.campusType === "SCHOOL" ? "High School" : "PUC"),
        stream: s.stream,
        academicYear: s.application?.academicYear || null,
        batch:
          s.currentGrade + (s.currentSection ? `-${s.currentSection}` : ""),
      }));

      // Format Counts
      const counts = {
        all: total,
        live:
          statusCounts.find((c) => c.status === "ACTIVE")?._count.status || 0,
        inactive:
          statusCounts.find((c) => c.status === "SUSPENDED")?._count.status ||
          0,
        completed:
          statusCounts.find((c) => c.status === "ALUMNI")?._count.status || 0,
        cancelled:
          statusCounts.find((c) => c.status === "WITHDRAWN")?._count.status ||
          0,
        previous: 0, // Not strictly mapped yet
      };

      res.status(200).json({
        students: formattedStudents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        counts,
      });
      return; // Ensure return
    } catch (error: any) {
      console.error(
        `StudentController.getAllStudents error: ${error?.message || error}`,
      );
      res.status(500).json({ error: { message: "Failed to fetch students" } });
      return; // Ensure return
    }
  }

  static async getStudentById(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const { studentId } = req.params;

      if (!tenantId || !authUserId) {
        return res.status(400).json({ error: { message: "Tenant context missing" } });
      }

      const student = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.student.findFirst({
          where: {
            id: studentId,
            tenantId,
            ...(campusId ? { campusId } : {}),
          },
          include: {
            campus: true,
            application: true,
            feeAssignments: {
              orderBy: { assignedAt: "desc" },
              take: 5,
            },
            invoices: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        }),
      );

      if (!student) {
        return res.status(404).json({ error: { message: "Student not found" } });
      }

      const customFields = (student.application?.customFields as Record<string, string | null> | null) || {};

      return res.json({
        student: {
          id: student.id,
          registrationNumber: student.registrationNumber,
          admissionNumber: student.admissionNumber,
          fullName: student.fullName,
          email: student.email,
          parentEmail: student.parentEmail,
          parentPhone: student.parentPhone,
          dob: student.dob,
          status: student.status,
          currentGrade: student.currentGrade,
          currentSection: student.currentSection,
          stream: student.stream,
          enrollmentDate: student.enrollmentDate,
          campus: {
            id: student.campus.id,
            name: student.campus.name,
            campusType: student.campus.campusType,
          },
          application: student.application
            ? {
                id: student.application.id,
                academicYear: student.application.academicYear,
                gradeApplyingFor: student.application.gradeApplyingFor,
                gender: student.application.gender,
                bloodGroup: student.application.bloodGroup,
                fatherName: student.application.fatherName,
                fatherPhone: student.application.fatherPhone,
                motherName: student.application.motherName,
                motherPhone: student.application.motherPhone,
                address: student.application.address,
                customFields,
              }
            : null,
          summary: {
            personalDetails: {
              dateOfBirth: student.dob,
              aadharNo: customFields.aadhar_no ?? "",
              bloodGroup: student.application?.bloodGroup ?? customFields.blood_group ?? "",
              areaType: customFields.area_type ?? "",
              motherTongue: customFields.mother_tongue ?? "",
              religion: customFields.religion ?? "",
              caste: customFields.caste ?? "",
            },
            parentDetails: {
              fatherName: student.application?.fatherName ?? "",
              fatherPhone: student.application?.fatherPhone ?? "",
              fatherOccupation: customFields.father_occupation ?? "",
              fatherEmail: customFields.father_email ?? "",
              fatherIncome: customFields.father_income ?? "",
              motherName: student.application?.motherName ?? "",
              motherPhone: student.application?.motherPhone ?? "",
              motherOccupation: customFields.mother_occupation ?? "",
              motherEmail: customFields.mother_email ?? "",
              motherIncome: customFields.mother_income ?? "",
            },
            address: customFields.address_line ?? (typeof student.application?.address === "string" ? student.application.address : ""),
            documents: {
              incomeCertificate: customFields.income_certificate ?? "Not Submitted",
              studyCertificate: customFields.study_certificate ?? "Not Submitted",
              aadharCard: customFields.aadhar_card_document ?? "Not Submitted",
              casteCertificate: customFields.caste_certificate ?? "Not Submitted",
              transferCertificate: customFields.transfer_certificate ?? "Not Submitted",
            },
          },
          finance: {
            recentFeeAssignments: student.feeAssignments,
            recentInvoices: student.invoices,
          },
        },
      });
    } catch (error: any) {
      console.error(`StudentController.getStudentById error: ${error?.message || error}`);
      return res.status(500).json({ error: { message: "Failed to fetch student details" } });
    }
  }

  static async getCertificates(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const { studentId } = req.params;

      if (!tenantId || !authUserId) {
        return res.status(400).json({ error: { message: "Tenant context missing" } });
      }

      const student = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.student.findFirst({
          where: {
            id: studentId,
            tenantId,
            ...(campusId ? { campusId } : {}),
          },
          select: { id: true },
        }),
      );

      if (!student) {
        return res.status(404).json({ error: { message: "Student not found" } });
      }

      const [availableTemplates, issued] = await Promise.all([
        loadCertificateTemplates(tenantId, authUserId),
        runWithTenantContext(tenantId, authUserId, (db) =>
          db.auditLog.findMany({
            where: {
              tenantId,
              action: "ISSUE_CERTIFICATE",
              entityType: "STUDENT_CERTIFICATE",
              entityId: studentId,
            },
            orderBy: { createdAt: "desc" },
          }),
        ),
      ]);

      return res.json({
        availableTemplates,
        issued: issued.map((entry) => ({
          id: entry.id,
          issuedAt: entry.createdAt,
          ...(entry.details as Record<string, unknown>),
        })),
      });
    } catch (error: any) {
      console.error(`StudentController.getCertificates error: ${error?.message || error}`);
      return res.status(500).json({ error: { message: "Failed to fetch certificates" } });
    }
  }

  static async issueCertificate(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      const actorProfileId = (req as any).user?.id as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const { studentId } = req.params;
      const { templateKey, purpose } = req.body ?? {};

      if (!tenantId || !authUserId) {
        return res.status(400).json({ error: { message: "Tenant context missing" } });
      }

      const availableTemplates = await loadCertificateTemplates(tenantId, authUserId);
      const template = availableTemplates.find((item) => item.key === templateKey);
      if (!template) {
        return res.status(400).json({ error: { message: "Invalid certificate template" } });
      }

      const payload = await runWithTenantContext(tenantId, authUserId, async (db) => {
        const student = await db.student.findFirst({
          where: {
            id: studentId,
            tenantId,
            ...(campusId ? { campusId } : {}),
          },
          include: {
            tenant: true,
            application: true,
            campus: true,
          },
        });

        if (!student) {
          throw new Error("Student not found");
        }

        const customFields = (student.application?.customFields as Record<string, string | null> | null) || {};
        const context: Record<string, string> = {
          student_name: student.fullName,
          reg_no: student.registrationNumber,
          usn: student.registrationNumber,
          current_year: student.currentGrade || "",
          current_term: customFields.current_term ?? student.currentSection ?? "",
          stream: student.stream ?? customFields.stream ?? "",
          program_name: student.application?.gradeApplyingFor ?? student.currentGrade,
          academic_year: student.application?.academicYear ?? "",
          quota: customFields.quota ?? "",
          admission_year: student.application?.academicYear ?? "",
          father_name: student.application?.fatherName ?? "",
          institution_name: student.tenant.name,
          institution_city: student.campus.name,
          institution_state: customFields.institution_state ?? "",
          institution_postal_code: customFields.institution_postal_code ?? "",
          certificate_purpose:
            String(purpose || "").trim() ||
            "Educational loan / Scholarship / Minority / KMDC loan / Opening bank A/c. / Bus Pass / Railway Pass / Passport Verification",
        };

        const renderedSections = renderCertificateSections(template.sections, context);
        const details = {
          templateKey: template.key,
          templateName: template.name,
          purpose: context.certificate_purpose,
          renderedSections,
          renderedContent: composeRenderedCertificateContent(renderedSections),
          status: "PENDING",
          approvedAt: null,
          studentId: student.id,
          registrationNumber: student.registrationNumber,
        };

        const audit = await db.auditLog.create({
          data: {
            tenantId,
            userId: actorProfileId,
            action: "ISSUE_CERTIFICATE",
            entityType: "STUDENT_CERTIFICATE",
            entityId: student.id,
            details,
          },
        });

        return {
          id: audit.id,
          issuedAt: audit.createdAt,
          ...details,
        };
      });

      return res.status(201).json(payload);
    } catch (error: any) {
      console.error(`StudentController.issueCertificate error: ${error?.message || error}`);
      return res.status(error?.message === "Student not found" ? 404 : 500).json({
        error: { message: error?.message || "Failed to issue certificate" },
      });
    }
  }

  static async approveCertificate(req: Request, res: Response) {
    try {
      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      const actorProfileId = (req as any).user?.id as string | undefined;
      const campusId = (req as any).campus?.campusId as string | undefined;
      const { studentId, certificateId } = req.params;

      if (!tenantId || !authUserId) {
        return res.status(400).json({ error: { message: "Tenant context missing" } });
      }

      const payload = await runWithTenantContext(tenantId, authUserId, async (db) => {
        const student = await db.student.findFirst({
          where: {
            id: studentId,
            tenantId,
            ...(campusId ? { campusId } : {}),
          },
          select: { id: true },
        });

        if (!student) {
          throw new Error("Student not found");
        }

        const certificate = await db.auditLog.findFirst({
          where: {
            id: certificateId,
            tenantId,
            action: "ISSUE_CERTIFICATE",
            entityType: "STUDENT_CERTIFICATE",
            entityId: studentId,
          },
        });

        if (!certificate) {
          throw new Error("Certificate not found");
        }

        const details = {
          ...((certificate.details as Record<string, unknown>) || {}),
          status: "APPROVED",
          approvedAt: new Date().toISOString(),
          approvedBy: actorProfileId ?? null,
        };

        const updated = await db.auditLog.update({
          where: { id: certificate.id },
          data: { details },
        });

        return {
          id: updated.id,
          issuedAt: updated.createdAt,
          ...(updated.details as Record<string, unknown>),
        };
      });

      return res.json(payload);
    } catch (error: any) {
      console.error(`StudentController.approveCertificate error: ${error?.message || error}`);
      return res.status(
        error?.message === "Student not found" || error?.message === "Certificate not found"
          ? 404
          : 500,
      ).json({
        error: { message: error?.message || "Failed to approve certificate" },
      });
    }
  }

  /**
   * POST /api/admin/students/:studentId/enable-portal
   * Idempotent: Can be called multiple times safely.
   */
  static async enablePortalAccess(req: Request, res: Response) {
    try {
      const { studentId } = req.params;
      const { loginMode, sendInvite } = req.body; // loginMode: 'REGNO_ONLY' | 'EMAIL'

      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      if (!tenantId || !authUserId) {
        res.status(400).json({ error: { message: "Tenant context missing" } });
        return;
      }

      // 1. Fetch Student
      const student = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.student.findUnique({
          where: { id: studentId },
        }),
      );

      if (!student) {
        res
          .status(404)
          .json({ error: { code: "NOT_FOUND", message: "Student not found" } });
        return;
      }

      if (student.portalAuthUserId) {
        res.status(200).json({
          message: "Portal access already enabled",
          userId: student.portalAuthUserId,
          alreadyEnabled: true,
        });
        return;
      }

      // 2. Determine Identity & Auth Email
      let authEmail = "";
      if (student.email && loginMode === "EMAIL") {
        const normalizedEmail = student.email.toLowerCase().trim();
        if (!isValidEmail(normalizedEmail)) {
          res.status(400).json({
            error: {
              code: "BAD_REQUEST",
              message: "Invalid student email format",
            },
          });
          return;
        }
        authEmail = normalizedEmail;
      } else {
        // Default or School: Use internal mapping
        authEmail = `${student.registrationNumber.toLowerCase()}@students.internal.local`;
      }

      // 3. Create or Fetch Supabase User (Idempotent) -> NOW MOCKED LOCAL USER
      // Check if profile exists
      const existingProfile = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.profile.findFirst({
          where: { tenantId, email: authEmail },
        }),
      );

      let userId = existingProfile ? existingProfile.id : uuidv4();

      await runWithTenantContext(tenantId, authUserId, async (db) => {
        await db.student.update({
          where: { id: studentId },
          data: { portalAuthUserId: userId },
        });

        await db.profile.upsert({
          where: { id: userId },
          create: {
            id: userId,
            tenantId,
            email: authEmail,
            fullName: student.fullName,
            role: "STUDENT",
            campusScope: student.campusType as any,
            isActive: true,
          },
          update: {
            role: "STUDENT",
            campusScope: student.campusType as any,
            isActive: true,
            fullName: student.fullName,
            email: authEmail,
          },
        });
      });

      // 6. Handle Invites (Reset/Setup Password)
      let deliveryDetail = "NONE";

      if (sendInvite) {
        // Determine where to send
        // If PU + Email login -> send to student.email
        // Else -> send to parentEmail or Fallback

        let recipientEmail = "";
        if (
          student.campusType === "PU" &&
          student.email &&
          loginMode === "EMAIL"
        ) {
          recipientEmail = student.email;
          deliveryDetail = "STUDENT_EMAIL";
        } else {
          recipientEmail = student.parentEmail || ADMIN_FALLBACK_EMAIL;
          deliveryDetail = student.parentEmail ? "PARENT" : "ADMIN_FALLBACK";
        }

        const loginUrl = `${APP_BASE_URL}/login`;
        // Mock invite link
        const inviteLink = `${APP_BASE_URL}/auth/callback?type=invite&token=mock-token-${userId}`;

        await EmailService.sendMail(
          recipientEmail,
          "ERP Access – Set your password",
          `<p>Activate the student portal account using the link below:</p>
            <p><a href="${inviteLink}">Set Password</a></p>
            <p>Reg No: ${student.registrationNumber}</p>
            <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`,
        );
      }

      res.status(200).json({
        message: "Portal access enabled",
        portalUserId: userId,
        alreadyEnabled: false,
        delivery: deliveryDetail,
      });
      return; // Ensure return
    } catch (error: any) {
      console.error(
        `StudentController.enablePortalAccess error: ${error?.message || error}`,
      );
      res
        .status(500)
        .json({ error: { message: "Failed to enable portal access" } });
      return; // Ensure return
    }
  }

  // POST /api/auth/student/login (Public)
  static async studentLogin(req: Request, res: Response) {
    try {
      const { regNo, password, tenantId } = req.body;
      if (!regNo || !password) {
        res
          .status(400)
          .json({ error: { message: "RegNo and Password required" } });
        return;
      }

      const resolvedTenantId =
        (tenantId as string | undefined) ??
        (req.headers["x-tenant-id"] as string | undefined);

      if (!resolvedTenantId) {
        res.status(400).json({ error: { message: "TenantId required" } });
        return;
      }

      const normalizedRegNo = String(regNo).trim().toUpperCase();
      const student = await runWithTenantContext(resolvedTenantId, ANON_USER_ID, (db) =>
        db.student.findFirst({
          where: { tenantId: resolvedTenantId, registrationNumber: normalizedRegNo },
        }),
      );

      if (!student) {
        res.status(404).json({ error: { message: "Student not found" } });
        return;
      }

      if (!student.portalAuthUserId) {
        res.status(403).json({
          error: { message: "Portal access not enabled for this student." },
        });
        return;
      }

      // Determine Auth Email
      let authEmail = `${normalizedRegNo.toLowerCase()}@students.internal.local`;

      const profile = await runWithTenantContext(resolvedTenantId, ANON_USER_ID, (db) =>
        db.profile.findUnique({
          where: { id: student.portalAuthUserId! },
        }),
      );
      if (profile?.email) authEmail = profile.email.toLowerCase();

      // Verify Password Hash via AuthUser (linked through UserProfileLink)
      const profileLink = profile
        ? await prisma.userProfileLink.findFirst({
            where: { profileId: profile.id },
            include: { user: true },
          })
        : null;
      const authUser = profileLink?.user ?? null;

      if (!authUser || !authUser.passwordHash) {
        // For now, fail if no password set, forcing them to use Forgot Password
        return res
          .status(401)
          .json({
            error: { message: "Invalid credentials or password not set." },
          });
      }

      const isValid = await bcrypt.compare(password, authUser.passwordHash);
      if (!isValid) {
        return res
          .status(401)
          .json({ error: { message: "Invalid credentials" } });
      }

      // Generate proper JWT (TODO: Use jsonwebtoken)
      // For now, continue using dev-token as placeholder if middleware accepts it,
      // OR implement real JWT signing here.
      // Since AuthController uses jwt.verify, we should sign it.
      const jwt = require("jsonwebtoken");
      const token = jwt.sign(
        {
          sub: student.portalAuthUserId,
          email: authEmail,
          role: "STUDENT",
          name: student.fullName,
        },
        process.env.JWT_SECRET || "super-secret-key",
        { expiresIn: "7d" },
      );

      // Return Session
      res.status(200).json({
        token: token,
        user: {
          id: student.portalAuthUserId,
          email: authEmail,
          role: "STUDENT",
          fullName: student.fullName,
          campusType: student.campusType,
        },
      });
      return; // Ensure return
    } catch (error: any) {
      console.error(
        `StudentController.studentLogin error: ${error?.message || error}`,
      );
      res.status(500).json({ error: { message: "Internal Login Error" } });
      return; // Ensure return
    }
  }

  // POST /api/auth/student/forgot-password (Public)
  static async studentForgotPassword(req: Request, res: Response) {
    try {
      const { regNo, verification, tenantId } = req.body;
      // verification = last 4 digits of parent phone

      // Generic success to prevent enumeration
      const genericResponse = { message: "If valid, reset instructions sent." };

      const normalizedRegNo = String(regNo || "")
        .trim()
        .toUpperCase();
      const resolvedTenantId =
        (tenantId as string | undefined) ??
        (req.headers["x-tenant-id"] as string | undefined);

      if (!resolvedTenantId) {
        return res.status(200).json(genericResponse);
      }

      const student = await runWithTenantContext(resolvedTenantId, ANON_USER_ID, (db) =>
        db.student.findFirst({
          where: { tenantId: resolvedTenantId, registrationNumber: normalizedRegNo },
        }),
      );
      if (!student || !student.portalAuthUserId) {
        return res.status(200).json(genericResponse);
      }

      // Verify Identity
      const verified = !!(
        student.parentPhone &&
        verification &&
        student.parentPhone.endsWith(String(verification))
      );
      if (!verified) return res.status(200).json(genericResponse);

      // Determine Auth Email
      const profile = await runWithTenantContext(resolvedTenantId, ANON_USER_ID, (db) =>
        db.profile.findUnique({
          where: { id: student.portalAuthUserId! },
          select: { email: true },
        }),
      );
      const authEmail =
        profile?.email ||
        `${normalizedRegNo.toLowerCase()}@students.internal.local`;

      // Generate Token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Get AuthUser for this profile via UserProfileLink
      const profileLinkFp = await prisma.userProfileLink.findFirst({
        where: { profileId: student.portalAuthUserId },
      });
      if (profileLinkFp) {
        await prisma.passwordResetToken.create({
          data: {
            userId: profileLinkFp.userId,
            tenantId: resolvedTenantId,
            tokenHash: resetTokenHash,
            purpose: "FORGOT_PASSWORD",
            expiresAt: resetTokenExpiry,
          },
        });
      }

      // Determine Delivery Email
      // Priority: Parent Email -> Admin Fallback
      // Validate parent email if present
      let deliveryEmail = ADMIN_FALLBACK_EMAIL;
      if (student.parentEmail) {
        const normalizedParentEmail = student.parentEmail.toLowerCase().trim();
        if (isValidEmail(normalizedParentEmail)) {
          deliveryEmail = normalizedParentEmail;
        }
      }

      // Generate Link
      const loginUrl = `${APP_BASE_URL}/login`;
      const resetLink = `${APP_BASE_URL}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(authEmail)}`;

      await EmailService.sendMail(
        deliveryEmail,
        "Reset your ERP password",
        `<p>A password reset was requested for Student Reg No: ${normalizedRegNo}</p>
          <p><a href="${resetLink}">Reset Password</a></p>
          <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`,
      );

      return res.status(200).json(genericResponse);
    } catch (error: any) {
      console.error(
        `StudentController.studentForgotPassword error: ${error?.message || error}`,
      );
      return res
        .status(200)
        .json({ message: "If valid, reset instructions sent." });
    }
  }

  // POST /api/admin/students/:studentId/reset-password (Admin)
  static async resetStudentPassword(req: Request, res: Response) {
    try {
      const { studentId } = req.params;

      const tenantId = (req as any).tenant?.tenantId as string | undefined;
      const authUserId = (req as any).auth?.authUserId as string | undefined;
      if (!tenantId || !authUserId) {
        res.status(400).json({ error: { message: "Tenant context missing" } });
        return;
      }

      const student = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.student.findUnique({
          where: { id: studentId },
        }),
      );
      if (!student || !student.portalAuthUserId) {
        res
          .status(404)
          .json({ error: { message: "Student or Portal Account not found" } });
        return;
      }

      // Determine Auth Email
      const profile = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.profile.findUnique({
          where: { id: student.portalAuthUserId! },
        }),
      );
      const authEmail =
        profile?.email ||
        `${student.registrationNumber.toLowerCase()}@students.internal.local`;

      // Generate Token
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetTokenHash = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Get AuthUser for this profile via UserProfileLink
      const profileLinkRp = await runWithTenantContext(tenantId, authUserId, (db) =>
        db.userProfileLink.findFirst({
          where: { profileId: student.portalAuthUserId! },
        }),
      );
      if (profileLinkRp) {
        await runWithTenantContext(tenantId, authUserId, (db) =>
          db.passwordResetToken.create({
            data: {
              userId: profileLinkRp.userId,
              tenantId,
              tokenHash: resetTokenHash,
              purpose: "FORGOT_PASSWORD",
              expiresAt: resetTokenExpiry,
            },
          }),
        );
      }

      // Validate and use parent email or fallback to admin email
      let deliveryEmail = ADMIN_FALLBACK_EMAIL;
      if (student.parentEmail) {
        const normalizedParentEmail = student.parentEmail.toLowerCase().trim();
        if (isValidEmail(normalizedParentEmail)) {
          deliveryEmail = normalizedParentEmail;
        }
      }

      const loginUrl = `${APP_BASE_URL}/login`;
      const resetLink = `${APP_BASE_URL}/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(authEmail)}`;

      await EmailService.sendMail(
        deliveryEmail,
        "Reset your ERP password",
        `<p>Administrator requested password reset for ${student.fullName} (${student.registrationNumber}).</p>
          <p><a href="${resetLink}">Reset Password</a></p>
          <p>Login: <a href="${loginUrl}">${loginUrl}</a></p>`,
      );

      res.status(200).json({ resetSent: true });
      return; // Ensure return
    } catch (error: any) {
      console.error(
        `StudentController.resetStudentPassword error: ${error?.message || error}`,
      );
      res
        .status(500)
        .json({ error: { message: "Failed to reset student password" } });
      return; // Ensure return
    }
  }
}
