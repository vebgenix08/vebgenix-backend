import dotenv from "dotenv";
// Load environment variables immediately
dotenv.config();

import express from "express";
// Triggering nodemon restart after fixing port 5000
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import router from "./interfaces/http/routes/index";

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Utility Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Routes
app.use("/api", router);

// Global Error Handler (must send JSON so clients get consistent shape)
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled Error:", err);
    if (res.headersSent) return;
    res.status(500).json({
      code: "INTERNAL",
      message: "Internal server error",
    });
  },
);

// Export app for Lambda
export { app };

// Start Server only if running directly (not imported as a module)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`👉 Health check: http://localhost:${PORT}/api/health`);
  });
}
