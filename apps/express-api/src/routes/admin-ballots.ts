import { Router } from "express";
import { z } from "zod";
import type {
  ApiSuccess,
  BallotRecord,
} from "@quorum/shared";
import {
  requireAdministrator,
  requireAuthentication
} from "../middleware/authentication.js";
import { getPrismaClient } from "../lib/prisma.js";
import { ballotRecord } from "../lib/ballot-record.js";

const scopeSchema = z.enum(["GLOBAL", "DEPARTMENTAL", "SENIOR", "CLUB", "COMBINED"]);

const createBallotSchema = z.object({
  title: z.string().trim().min(5).max(150),
  description: z.string().trim().max(2000).optional(),
  scopeType: scopeSchema,
  scopeTarget: z.string().trim().max(100).nullish(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true })
}).superRefine((value, context) => {
  if (value.scopeType === "GLOBAL" && value.scopeTarget) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scopeTarget"],
      message: "Global ballots cannot have a scope target"
    });
  }
  if (value.scopeType !== "GLOBAL" && !value.scopeTarget) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scopeTarget"],
      message: "A scope target is required"
    });
  }
  if (new Date(value.startTime) >= new Date(value.endTime)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endTime"],
      message: "Voting must close after it opens"
    });
  }
});

const router = Router();
router.use(requireAuthentication, requireAdministrator);

router.get("/", async (_request, response) => {
  const ballots = await getPrismaClient().ballot.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { candidates: true, runoffs: true } } }
  });
  const result: ApiSuccess<BallotRecord[]> = { data: ballots.map(ballotRecord) };
  response.json(result);
});

router.post("/", async (request, response) => {
  const parsed = createBallotSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Review the ballot details and schedule",
        details: parsed.error.flatten().fieldErrors
      }
    });
    return;
  }

  const ballot = await getPrismaClient().ballot.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      scopeType: parsed.data.scopeType,
      scopeTarget: parsed.data.scopeType === "GLOBAL" ? null : parsed.data.scopeTarget,
      startTime: new Date(parsed.data.startTime),
      endTime: new Date(parsed.data.endTime)
    },
    include: { _count: { select: { candidates: true, runoffs: true } } }
  });

  const result: ApiSuccess<BallotRecord> = { data: ballotRecord(ballot) };
  response.status(201).json(result);
});

export const adminBallotsRouter = router;
