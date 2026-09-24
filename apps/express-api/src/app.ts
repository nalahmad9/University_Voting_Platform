import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { checkPrismaConnection } from "./lib/prisma.js";
import { authRouter } from "./routes/auth.js";
import { adminBallotsRouter } from "./routes/admin-ballots.js";
import { studentBallotsRouter } from "./routes/student-ballots.js";
import { studentNominationsRouter } from "./routes/student-nominations.js";
import { adminNominationsRouter } from "./routes/admin-nominations.js";
import { studentVerificationRouter } from "./routes/student-verification.js";
import { votingRouter } from "./routes/voting.js";
import { publicReceiptsRouter } from "./routes/public-receipts.js";
import { adminTalliesRouter } from "./routes/admin-tallies.js";
import { publicResultsRouter } from "./routes/public-results.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/v1/health", (_request, response) => {
  response.json({ status: "ok", service: "quorum-express-api" });
});

app.get("/api/v1/health/database", async (_request, response) => {
  try {
    await checkPrismaConnection();
    response.json({ status: "ok", service: "quorum-database" });
  } catch (error) {
    console.error("Database health check failed", error instanceof Error ? error.message : "Unknown error");
    response.status(503).json({
      status: "unavailable",
      service: "quorum-database"
    });
  }
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin/ballots", adminBallotsRouter);
app.use("/api/v1/student/ballots", studentBallotsRouter);
app.use("/api/v1/student/nominations", studentNominationsRouter);
app.use("/api/v1/admin/nominations", adminNominationsRouter);
app.use("/api/v1/student/verification", studentVerificationRouter);
app.use("/api/v1/public", publicReceiptsRouter);
app.use("/api/v1/public", publicResultsRouter);
app.use("/api/v1/admin", adminTalliesRouter);
app.use("/api/v1", votingRouter);

app.use((_request, response) => {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled API error", error instanceof Error ? error.message : "Unknown error");
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong while completing your request. Please try again."
    }
  });
});
