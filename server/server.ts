import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env file
config({ path: path.resolve(__dirname, ".env") });

console.log("server/server module imported");

// Re-export createServer
export { createServer } from "./index";
