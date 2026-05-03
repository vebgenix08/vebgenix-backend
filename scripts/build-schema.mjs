/**
 * build-schema.mjs
 *
 * Single source of truth for the AppSync GraphQL schema.
 *
 * Canonical location:  graphql/schema.graphql
 * CDK deployment copy: aws-infrastructure/lib/schema/schema.graphql
 *
 * This script copies the canonical schema to the CDK location so that
 * `cdk deploy` always picks up the latest changes.
 *
 * Workflow:
 *   1. Edit graphql/schema.graphql
 *   2. Run: npm run build:schema
 *   3. Commit BOTH graphql/schema.graphql AND aws-infrastructure/lib/schema/schema.graphql
 *   4. Deploy: cd aws-infrastructure && npx cdk deploy -c env=dev --all
 *
 * NOTE: The graphql/modules/ directory contains legacy module fragments from
 * the old Express backend. They are NOT used by this script and should be
 * ignored. The canonical schema is the single file at graphql/schema.graphql.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, "..");
const SOURCE_SCHEMA  = path.join(rootDir, "graphql", "schema.graphql");
const CDK_SCHEMA_DIR = path.join(rootDir, "aws-infrastructure", "lib", "schema");
const CDK_SCHEMA     = path.join(CDK_SCHEMA_DIR, "schema.graphql");

// ---------------------------------------------------------------------------
// 1. Read canonical source
// ---------------------------------------------------------------------------
if (!fs.existsSync(SOURCE_SCHEMA)) {
  console.error(`Error: Source schema not found at ${SOURCE_SCHEMA}`);
  process.exit(1);
}

const schema = fs.readFileSync(SOURCE_SCHEMA, "utf-8");
if (!schema.trim()) {
  console.error("Error: Source schema is empty!");
  process.exit(1);
}
console.log(`Source schema: ${SOURCE_SCHEMA} (${schema.length} bytes)`);

// ---------------------------------------------------------------------------
// 2. Verify required fields are present
//    Add new fields here as new resolvers are registered in appsync-stack.ts
// ---------------------------------------------------------------------------
const REQUIRED_FIELDS = [
  // Auth / Identity
  "me", "listUsers", "createUser", "inviteStaff",
  // Admissions
  "listEnquiries", "createEnquiry", "createPublicEnquiry",
  "listApplications", "reviewApplication", "approveApplication",
  "checkDuplicate", "admissionsStats",
  // Finance
  "listFeeHeads", "createFeeHead",
  "listFeeStructures", "createFeeStructure",
  "listFeeAssignments", "createFeeAssignment", "bulkAssignFeeStructure",
  "listInvoices", "createInvoice", "recordPayment",
  "createPaymentOrder", "verifyPaymentSignature",
  "dayBookReport", "feeCollectionAnalytics",
  // Academics
  "listClasses", "getClass", "createClass",
  "listAllSections", "getSection", "createSection", "setSectionIncharge",
  "listSubjects", "getSubject", "createSubject",
  "enrollStudent", "listStudents", "getStudent",
  "markSectionAttendance", "getSectionAttendance",
  "createExam", "enterMarks", "publishResults",
  "issueCertificate", "enablePortalAccess",
  // Settings
  "listTenants", "getTenant", "createTenant",
  "listCampuses", "createCampus",
  "listPrograms", "createProgram",
  "listAcademicYears", "createAcademicYear", "setActiveAcademicYear",
  "listTemplates", "createTemplate", "publishTemplateVersion",
  "getTenantFeatures", "updateTenantFeatures",
  "createFirstAdmin", "finalizeTenant",
  "dashboardOverview", "superAdminOverview",
  "listAuditLogs", "listPlatformAuditLogs",
  // Comms
  "listAnnouncements", "createAnnouncement", "publishAnnouncement",
  "listEvents", "createEvent",
  "listLeaveRequests", "createLeaveRequest", "approveLeave",
  // Results
  "listResultBatches", "createResultBatch", "publishResultBatch",
  "getPublicResult", "getResultPublicToken",
  // Storage
  "generateUploadUrl", "generateDownloadUrl",
  // Cleanup
  "getDuplicateReport", "mergeEnquiries", "mergeStudents",
];

let allOk = true;
for (const field of REQUIRED_FIELDS) {
  if (!schema.includes(field)) {
    console.error(`  ✗ MISSING: '${field}'`);
    allOk = false;
  } else {
    console.log(`  ✓ ${field}`);
  }
}

if (!allOk) {
  console.error("\nError: Schema is missing required fields listed above.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Guard against extend type blocks (AppSync startSchemaCreation ignores them)
// ---------------------------------------------------------------------------
if (/\bextend\s+type\b/.test(schema)) {
  console.error("Error: 'extend type' blocks found — AppSync silently ignores them.");
  console.error("Merge all extensions into the base type definition.");
  process.exit(1);
}
console.log("  ✓ No extend type blocks");

// ---------------------------------------------------------------------------
// 4. Write CDK copy
// ---------------------------------------------------------------------------
if (!fs.existsSync(CDK_SCHEMA_DIR)) {
  fs.mkdirSync(CDK_SCHEMA_DIR, { recursive: true });
}
fs.writeFileSync(CDK_SCHEMA, schema, "utf-8");
console.log(`\nCopied schema to ${CDK_SCHEMA}`);
console.log("\n✅  Schema build complete. Both files are in sync.");
console.log("   Commit both:\n   git add graphql/schema.graphql aws-infrastructure/lib/schema/schema.graphql");
