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

const ORDER = [
  "common.graphql",
  "dashboard.graphql",
  "admissions.graphql",
  "students.graphql",
  "users.graphql",
  "fees.graphql",
  "templates.graphql",
];

let finalSchema = "";

for (const file of ORDER) {
  const filePath = path.join(MODULES_DIR, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    finalSchema += `\n# --- ${file} ---\n\n`;
    finalSchema += content.trim() + "\n";
  } else {
    console.warn(`Warning: ${file} not found in ${MODULES_DIR}`);
  }
}

if (!finalSchema.trim()) {
  console.error("Error: Generated schema is empty!");
  process.exit(1);
}

fs.writeFileSync(OUTPUT_SCHEMA, finalSchema.trim() + "\n", "utf-8");
console.log(`Successfully generated schema at ${OUTPUT_SCHEMA}`);

if (!fs.existsSync(CDK_SCHEMA_DIR)) {
  fs.mkdirSync(CDK_SCHEMA_DIR, { recursive: true });
}
fs.writeFileSync(CDK_SCHEMA_FILE, finalSchema.trim() + "\n", "utf-8");
console.log(`Successfully copied schema to ${CDK_SCHEMA_FILE}`);
