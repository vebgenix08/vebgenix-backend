import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, "..");
const MODULES_DIR = path.join(rootDir, "graphql", "modules");
const OUTPUT_SCHEMA = path.join(rootDir, "graphql", "schema.graphql");
const CDK_SCHEMA_DIR = path.join(
  rootDir,
  "aws-infrastructure",
  "lib",
  "schema",
);
const CDK_SCHEMA_FILE = path.join(CDK_SCHEMA_DIR, "schema.graphql");

// Order matters: base types (common.graphql) MUST come first so AppSync
// sees 'type Query' before any 'extend type Query' blocks.
const ORDER = [
  "common.graphql",
  "dashboard.graphql",
  "admissions.graphql",
  "students.graphql",
  "users.graphql",
  "fees.graphql",
  "templates.graphql",
  "auditLogs.graphql",
];

// ---------------------------------------------------------------------------
// Concatenate modules
// ---------------------------------------------------------------------------
let rawSchema = "";
for (const file of ORDER) {
  const filePath = path.join(MODULES_DIR, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    rawSchema += `\n# --- ${file} ---\n\n`;
    rawSchema += content.trim() + "\n";
  } else {
    console.warn(`Warning: ${file} not found in ${MODULES_DIR}`);
  }
}

if (!rawSchema.trim()) {
  console.error("Error: Generated schema is empty!");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Merge all `extend type X { ... }` blocks into the base `type X { ... }`.
//
// AppSync's startSchemaCreation API silently ignores `extend type` blocks —
// only the base `type X { }` definition is applied. By merging here, the
// generated schema works with BOTH CloudFormation and the AppSync API.
// ---------------------------------------------------------------------------
function mergeExtendTypes(schema) {
  // Collect all extension bodies keyed by type name
  const extensions = {};
  const extendRegex = /extend\s+type\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match;
  while ((match = extendRegex.exec(schema)) !== null) {
    const typeName = match[1];
    const body = match[2].trim();
    if (!extensions[typeName]) extensions[typeName] = [];
    if (body) extensions[typeName].push(body);
  }

  // Remove all extend blocks from the schema
  let merged = schema.replace(/extend\s+type\s+\w+\s*\{[\s\S]*?\}/g, "");

  // Inject extension fields into the matching base type blocks
  for (const [typeName, bodies] of Object.entries(extensions)) {
    const baseTypeRegex = new RegExp(
      `(type\\s+${typeName}\\s*(?:implements[^{]+)?\\{)([\\s\\S]*?)(\\})`,
      "g",
    );
    merged = merged.replace(baseTypeRegex, (fullMatch, open, body, close) => {
      const extraFields = bodies.join("\n  ");
      return `${open}${body}  ${extraFields}\n${close}`;
    });
  }

  // Remove blank lines that accumulate from stripped extend blocks
  merged = merged.replace(/\n{3,}/g, "\n\n");

  return merged;
}

const finalSchema = mergeExtendTypes(rawSchema).trim() + "\n";

// ---------------------------------------------------------------------------
// Verify the merged schema has the required fields
// ---------------------------------------------------------------------------
const required = [
  "dashboardOverview",
  "superAdminOverview",
  "listPlatformAuditLogs",
  "getPlatformAuditLog",
];
for (const field of required) {
  if (!finalSchema.includes(field)) {
    console.error(
      `Error: Required field '${field}' missing from merged schema!`,
    );
    process.exit(1);
  }
  console.log(`  ✓ ${field}`);
}

// Ensure no extend type blocks remain
if (/\bextend\s+type\b/.test(finalSchema)) {
  console.error("Error: extend type blocks remain in merged schema!");
  process.exit(1);
}
console.log("  ✓ No extend type blocks (AppSync-safe)");

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
fs.writeFileSync(OUTPUT_SCHEMA, finalSchema, "utf-8");
console.log(`\nSuccessfully generated schema at ${OUTPUT_SCHEMA}`);

if (!fs.existsSync(CDK_SCHEMA_DIR)) {
  fs.mkdirSync(CDK_SCHEMA_DIR, { recursive: true });
}
fs.writeFileSync(CDK_SCHEMA_FILE, finalSchema, "utf-8");
console.log(`Successfully copied schema to ${CDK_SCHEMA_FILE}`);
