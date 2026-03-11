import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";
import { EmailService } from "../../../infrastructure/services/emailService";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
const ADMIN_FALLBACK_EMAIL =
  process.env.ADMIN_FALLBACK_EMAIL || "dhanushags1567@gmail.com";

// Email validation: simple regex for email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export class StudentController {
  /**
   * GET /api/admin/students
   * Fetch all students with pagination, search, and filtering
   */
  static async getAllStudents(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || "";
      const status = (req.query.status as string) || "all";
      const campusScope = (req.query.scope as string) || "All"; // School, PU, or All

      const skip = (page - 1) * limit;

      // Build Where Clause
      const where: any = {};

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
      const [students, total, statusCounts] = await Promise.all([
        prisma.student.findMany({
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
          },
        }),
        prisma.student.count({ where }),
        prisma.student.groupBy({
          by: ["status"],
          _count: { status: true },
        }),
      ]);

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
        program: s.campusType === "SCHOOL" ? "High School" : "PUC",
        stream: s.stream,
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

  /**
   * POST /api/admin/students/:studentId/enable-portal
   * Idempotent: Can be called multiple times safely.
   */
  static async enablePortalAccess(req: Request, res: Response) {
    try {
      const { studentId } = req.params;
      const { loginMode, sendInvite } = req.body; // loginMode: 'REGNO_ONLY' | 'EMAIL'

      // 1. Fetch Student
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });

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
      let existingProfile = await prisma.profile.findFirst({
        where: { email: authEmail },
      });

      let userId = existingProfile ? existingProfile.id : uuidv4();

      // 4. Update Student Record
      await prisma.student.update({
        where: { id: studentId },
        data: { portalAuthUserId: userId },
      });

      const tenantId = (req as any).tenant?.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: { message: "Tenant context missing" } });
        return;
      }

      // 5. Upsert Profile
      await prisma.profile.upsert({
        where: { id: userId },
        create: {
          id: userId,
          email: authEmail,
          fullName: student.fullName,
          role: "STUDENT",
          campusScope: student.campusType as any, // CampusType → CampusScope (SCHOOL/PU overlap)
          isActive: true,
          tenant: { connect: { id: tenantId } },
        },
        update: {
          role: "STUDENT",
          campusScope: student.campusType as any, // CampusType → CampusScope (SCHOOL/PU overlap)
          isActive: true,
          fullName: student.fullName,
          email: authEmail,
        },
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
      const { regNo, password } = req.body;
      if (!regNo || !password) {
        res
          .status(400)
          .json({ error: { message: "RegNo and Password required" } });
        return;
      }

      const normalizedRegNo = String(regNo).trim().toUpperCase();
      const student = await prisma.student.findFirst({
        where: { registrationNumber: normalizedRegNo },
      });

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

      const profile = await prisma.profile.findUnique({
        where: { id: student.portalAuthUserId },
      });
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
      const { regNo, verification } = req.body;
      // verification = last 4 digits of parent phone

      // Generic success to prevent enumeration
      const genericResponse = { message: "If valid, reset instructions sent." };

      const normalizedRegNo = String(regNo || "")
        .trim()
        .toUpperCase();
      const student = await prisma.student.findFirst({
        where: { registrationNumber: normalizedRegNo },
      });
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
      const profile = await prisma.profile.findFirst({
        where: {
          email:
            student.registrationNumber.toLowerCase() +
            "@students.internal.local",
        }, // Assuming this logic or just find by ID
      });
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

      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });
      if (!student || !student.portalAuthUserId) {
        res
          .status(404)
          .json({ error: { message: "Student or Portal Account not found" } });
        return;
      }

      // Determine Auth Email
      const profile = await prisma.profile.findUnique({
        where: { id: student.portalAuthUserId },
      });
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
      const profileLinkRp = await prisma.userProfileLink.findFirst({
        where: { profileId: student.portalAuthUserId },
      });
      if (profileLinkRp) {
        await prisma.passwordResetToken.create({
          data: {
            userId: profileLinkRp.userId,
            tokenHash: resetTokenHash,
            purpose: "FORGOT_PASSWORD",
            expiresAt: resetTokenExpiry,
          },
        });
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
