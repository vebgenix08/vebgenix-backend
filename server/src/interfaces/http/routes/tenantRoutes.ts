import { Router } from "express";
import { verifyJwt } from "../middleware/verifyJwt";
import { resolveTenant } from "../middleware/resolveTenant";
import { enforceTenantMatch } from "../middleware/enforceTenantMatch";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import {
  getTenantMe,
  getCampuses,
  createCampus,
  updateCampus,
  updateFeatures,
} from "../controllers/TenantController";
import {
  listAcademicYears,
  createAcademicYear,
  listPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  listTemplates,
  createTemplate,
  updateTemplate,
  publishTemplateVersion,
  deleteTemplate,
} from "../controllers/SettingsController";
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  assignStudentClass,
} from "../controllers/AcademicsController";

const router = Router({ mergeParams: true });

// All tenant routes: verifyJwt → resolveTenant → enforceTenantMatch → requireAuth
router.use(verifyJwt);
router.use(resolveTenant);
router.use(enforceTenantMatch);
router.use(requireAuth);

// GET /api/tenant/me
router.get("/me", getTenantMe);

// ─── Campuses ────────────────────────────────────────────────────────────────
// GET /api/tenant/campuses - ADMIN only
router.get("/campuses", requireRole(["ADMIN"]), getCampuses);

// POST /api/tenant/campuses - ADMIN only
router.post("/campuses", requireRole(["ADMIN"]), createCampus);

// PATCH /api/tenant/campuses/:campusId - ADMIN only
router.patch("/campuses/:campusId", requireRole(["ADMIN"]), updateCampus);

// PATCH /api/tenant/features - ADMIN only
router.patch("/features", requireRole(["ADMIN"]), updateFeatures);

// ─── Academic Years ──────────────────────────────────────────────────────────
// GET /api/tenant/academic-years
router.get("/academic-years", listAcademicYears);

// POST /api/tenant/academic-years - ADMIN only
router.post("/academic-years", requireRole(["ADMIN"]), createAcademicYear);

// ─── Programs ────────────────────────────────────────────────────────────────
// GET /api/tenant/programs
router.get("/programs", listPrograms);

// POST /api/tenant/programs - ADMIN only
router.post("/programs", requireRole(["ADMIN"]), createProgram);

// PATCH /api/tenant/programs/:programId - ADMIN only
router.patch("/programs/:programId", requireRole(["ADMIN"]), updateProgram);

// DELETE /api/tenant/programs/:programId - ADMIN only
router.delete("/programs/:programId", requireRole(["ADMIN"]), deleteProgram);

// ─── Templates ───────────────────────────────────────────────────────────────
// GET /api/tenant/templates
router.get("/templates", listTemplates);

// POST /api/tenant/templates - ADMIN only
router.post("/templates", requireRole(["ADMIN"]), createTemplate);

// PATCH /api/tenant/templates/:templateId - ADMIN only
router.patch("/templates/:templateId", requireRole(["ADMIN"]), updateTemplate);

// POST /api/tenant/templates/:templateId/versions - ADMIN only
router.post("/templates/:templateId/versions", requireRole(["ADMIN"]), publishTemplateVersion);

// DELETE /api/tenant/templates/:templateId - ADMIN only
router.delete("/templates/:templateId", requireRole(["ADMIN"]), deleteTemplate);

// ─── Classes ─────────────────────────────────────────────────────────────────
router.get("/classes", requireRole(["ADMIN"]), listClasses);
router.post("/classes", requireRole(["ADMIN"]), createClass);
router.patch("/classes/:classId", requireRole(["ADMIN"]), updateClass);
router.delete("/classes/:classId", requireRole(["ADMIN"]), deleteClass);

// ─── Sections ────────────────────────────────────────────────────────────────
router.get("/classes/:classId/sections", requireRole(["ADMIN"]), listSections);
router.post("/classes/:classId/sections", requireRole(["ADMIN"]), createSection);
router.patch("/classes/:classId/sections/:sectionId", requireRole(["ADMIN"]), updateSection);
router.delete("/classes/:classId/sections/:sectionId", requireRole(["ADMIN"]), deleteSection);

// ─── Subjects ────────────────────────────────────────────────────────────────
router.get("/subjects", requireRole(["ADMIN"]), listSubjects);
router.post("/subjects", requireRole(["ADMIN"]), createSubject);
router.patch("/subjects/:subjectId", requireRole(["ADMIN"]), updateSubject);
router.delete("/subjects/:subjectId", requireRole(["ADMIN"]), deleteSubject);

// ─── Student class assignment ────────────────────────────────────────────────
router.patch("/students/:studentId/assign-class", requireRole(["ADMIN"]), assignStudentClass);

export default router;
