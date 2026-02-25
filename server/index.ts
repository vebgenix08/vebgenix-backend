import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

// Ensure .env is loaded from server directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, ".env"), override: true });

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { authRouterV2 } from "./src/routes/authV2";
import { authMiddleware as auth } from "./src/middleware/auth";
import { User } from "./src/models/UserV2";
import { EmailRoleMapping } from "./src/models/EmailRoleMapping";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/vebgenix";
console.log("MONGODB_URI configured:", MONGODB_URI.substring(0, 50) + "...");

export async function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check route (available before DB connection)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Auth routes
  app.use("/api/auth", authRouterV2);

  // Users routes
  try {
    const { default: usersRouter } = await import("./src/routes/users");
    app.use("/api/users", usersRouter);
    console.log("Users router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load users router:",
      err && err.message ? err.message : err,
    );
  }

  // Classes routes
  try {
    const { classesRouter } = await import("./routes/classes");
    app.use("/api/classes", classesRouter);
    console.log("Classes router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load classes router:",
      err && err.message ? err.message : err,
    );
  }

  // New Classes routes (New Class Setup and Sections)
  try {
    const { newClassesRouter } = await import("./src/routes/newClasses");
    app.use("/api/new-classes", auth, newClassesRouter);
    console.log("New Classes router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load new classes router:",
      err && err.message ? err.message : err,
    );
  }

  // Enrollment routes (migrated to enrollmentV2, keeping legacy handler)
  try {
    const { default: enrollmentRouter } = await import(
      "./src/routes/enrollmentV2"
    );
    app.use("/api/enrollments", enrollmentRouter);
    console.log("Enrollment router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load enrollment router:",
      err && err.message ? err.message : err,
    );
  }

  // Finance routes
  try {
    const { financeRouter } = await import("./src/routes/finance");
    app.use("/api/finance", auth, financeRouter);
    console.log("Finance router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load finance router:",
      err && err.message ? err.message : err,
    );
  }

  // Departments routes
  try {
    const { departmentsRouter } = await import("./src/routes/departments");
    app.use("/api/departments", auth, departmentsRouter);
    console.log("Departments router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load departments router:",
      err && err.message ? err.message : err,
    );
  }

  // Students routes
  try {
    const { studentsRouter } = await import("./src/routes/students");
    app.use("/api/students", auth, studentsRouter);
    console.log("Students router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load students router:",
      err && err.message ? err.message : err,
    );
  }

  // Audit Logs routes
  try {
    const { auditLogsRouter } = await import("./src/routes/auditLogs");
    app.use("/api/audit-logs", auth, auditLogsRouter);
    console.log("Audit Logs router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load audit logs router:",
      err && err.message ? err.message : err,
    );
  }

  // StudentV2 routes (new student management with user_id)
  try {
    const { studentV2Router } = await import("./src/routes/studentV2");
    app.use("/api/students-v2", auth, studentV2Router);
    console.log("StudentV2 router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load studentV2 router:",
      err && err.message ? err.message : err,
    );
  }

  // Timetable routes
  try {
    const { timetableRouter } = await import("./src/routes/timetable");
    app.use("/api/timetables", auth, timetableRouter);
    console.log("Timetable router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load timetable router:",
      err && err.message ? err.message : err,
    );
  }

  // Onboarding routes
  try {
    const { default: onboardingRouter } = await import(
      "./src/routes/onboardingV2"
    );
    app.use("/api/onboarding", auth, onboardingRouter);
    console.log("Onboarding router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load onboarding router:",
      err && err.message ? err.message : err,
    );
  }

  // Enrollment V2 routes
  try {
    const { default: enrollmentV2Router } = await import(
      "./src/routes/enrollmentV2"
    );
    app.use("/api/enrollments-v2", auth, enrollmentV2Router);
    console.log("Enrollment V2 router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load enrollment V2 router:",
      err && err.message ? err.message : err,
    );
  }

  // Bulk Upload V2 routes
  try {
    const { default: bulkUploadV2Router } = await import(
      "./src/routes/bulkUploadV2"
    );
    app.use("/api/bulk-upload", bulkUploadV2Router);
    console.log("Bulk Upload V2 router loaded successfully");
  } catch (err) {
    console.error(
      "Could not load bulk upload V2 router:",
      err && err.message ? err.message : err,
    );
  }

  // Connect to MongoDB asynchronously (non-blocking)
  connectToDatabase();

  return app;
}

async function connectToDatabase() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });
    console.log("Connected to MongoDB");

    // Initialize email role mappings if empty (only on first run)
    try {
      const existingMappings = await EmailRoleMapping.countDocuments();
      if (existingMappings === 0) {
        const mappings = [
          {
            email: "dhanushags1567@gmail.com",
            role: "admin",
            matchType: "exact",
            priority: 10,
          },
          {
            email: "teacher@vebgenix.com",
            role: "teacher",
            matchType: "exact",
            priority: 10,
          },
          {
            email: "student@vebgenix.com",
            role: "student",
            matchType: "exact",
            priority: 10,
          },
          { pattern: "admin", role: "admin", matchType: "domain", priority: 5 },
          {
            pattern: "teacher",
            role: "teacher",
            matchType: "domain",
            priority: 5,
          },
          {
            pattern: "student",
            role: "student",
            matchType: "domain",
            priority: 5,
          },
        ];

        for (const mapping of mappings) {
          await EmailRoleMapping.create(mapping);
        }
        console.log("✓ Created default email role mappings");
      }

      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount > 0) {
        console.log("✓ Using existing admin users from database");
      }
    } catch (initError) {
      console.error("Error during initialization:", initError);
    }
  } catch (error) {
    console.error("MongoDB connection error:", error);
    console.log("App will continue running without database");
  }
}
