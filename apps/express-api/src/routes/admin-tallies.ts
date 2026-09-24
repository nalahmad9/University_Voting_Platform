import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type {
  AdminAnomalyRecord,
  ApiSuccess,
  BallotRecord,
  BallotTallyResult,
  PublishedBallotResult
} from "@quorum/shared";

import {
  requireAdministrator,
  requireAuthentication,
  type AuthenticatedRequest
} from "../middleware/authentication.js";
import { getPrismaClient } from "../lib/prisma.js";
import { ballotRecord } from "../lib/ballot-record.js";
import { publishedBallotResult, readPublishedResultSnapshot } from "../lib/result-publication.js";
import { calculateBallotTally, createPublishedResultSnapshot } from "../lib/tally.js";

const router = Router();
router.use(requireAuthentication, requireAdministrator);

const uuidSchema = z.string().uuid();
const reviewSchema = z.object({
  decision: z.enum(["RESTORE", "CONFIRM"]),
  reason: z.string().trim().min(10).max(1000)
}).strict();
const runoffSchema = z.object({
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true })
}).strict().superRefine((value, context) => {
  const startTime = new Date(value.startTime);
  const endTime = new Date(value.endTime);
  if (startTime <= new Date()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startTime"], message: "Runoff voting must start in the future" });
  }
  if (endTime <= startTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "Runoff voting must close after it opens" });
  }
});

function safeRiskFeatures(value: Prisma.JsonValue): AdminAnomalyRecord["riskFeatures"] {
  const item = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    deviceClass: ["desktop", "mobile", "tablet", "unknown"].includes(String(item.deviceClass))
      ? item.deviceClass as AdminAnomalyRecord["riskFeatures"]["deviceClass"]
      : "unknown",
    completionDurationBand: ["under_20_seconds", "20_to_60_seconds", "over_60_seconds"].includes(String(item.completionDurationBand))
      ? item.completionDurationBand as AdminAnomalyRecord["riskFeatures"]["completionDurationBand"]
      : "over_60_seconds",
    requestRateBucket: ["normal", "elevated", "high"].includes(String(item.requestRateBucket))
      ? item.requestRateBucket as AdminAnomalyRecord["riskFeatures"]["requestRateBucket"]
      : "normal",
    replayIndicator: item.replayIndicator === true
  };
}

router.get("/anomalies", async (_request, response) => {
  const votes = await getPrismaClient().voteHash.findMany({
    where: { reviewStatus: { not: "NOT_REQUIRED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ballotId: true,
      receiptHash: true,
      anomalyScore: true,
      riskFeatures: true,
      anomalyModelVersion: true,
      reviewStatus: true,
      reviewReason: true,
      reviewedAt: true,
      reviewedBy: true,
      createdAt: true,
      ballot: { select: { title: true } }
    }
  });
  const data: AdminAnomalyRecord[] = votes.map(vote => ({
    id: vote.id,
    ballotId: vote.ballotId,
    ballotTitle: vote.ballot.title,
    receiptPrefix: `${vote.receiptHash.slice(0, 8)}…`,
    anomalyScore: Number(vote.anomalyScore),
    riskFeatures: safeRiskFeatures(vote.riskFeatures),
    modelVersion: vote.anomalyModelVersion,
    reviewStatus: vote.reviewStatus as AdminAnomalyRecord["reviewStatus"],
    reviewReason: vote.reviewReason,
    reviewedAt: vote.reviewedAt?.toISOString() ?? null,
    reviewedBy: vote.reviewedBy,
    recordedAt: vote.createdAt.toISOString()
  }));
  const result: ApiSuccess<AdminAnomalyRecord[]> = { data };
  response.setHeader("Cache-Control", "no-store");
  response.json(result);
});

router.patch("/anomalies/:id", async (request: AuthenticatedRequest, response) => {
  const id = uuidSchema.safeParse(request.params.id);
  const input = reviewSchema.safeParse(request.body);
  if (!id.success || !input.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A valid decision and reason are required" } });
    return;
  }
  const existing = await getPrismaClient().voteHash.findUnique({
    where: { id: id.data },
    select: {
      reviewStatus: true,
      ballot: { select: { resultsPublishedAt: true } }
    }
  });
  if (!existing || existing.reviewStatus === "NOT_REQUIRED") {
    response.status(404).json({ error: { code: "ANOMALY_NOT_FOUND", message: "The anomaly review item was not found" } });
    return;
  }
  if (existing.ballot.resultsPublishedAt) {
    response.status(409).json({
      error: { code: "RESULTS_ALREADY_PUBLISHED", message: "Published results are frozen and can no longer be recalculated" }
    });
    return;
  }
  const restored = input.data.decision === "RESTORE";
  const updated = await getPrismaClient().voteHash.update({
    where: { id: id.data },
    data: {
      isQuarantined: !restored,
      reviewStatus: restored ? "RESTORED" : "CONFIRMED",
      reviewReason: input.data.reason,
      reviewedAt: new Date(),
      reviewedBy: request.auth?.role === "administrator" ? request.auth.email : "administrator"
    },
    select: { id: true, reviewStatus: true }
  });
  response.json({ data: updated });
});

router.get("/tallies/:ballotId", async (request, response) => {
  const ballotId = uuidSchema.safeParse(request.params.ballotId);
  if (!ballotId.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid ballot identifier" } });
    return;
  }
  const tally = await calculateBallotTally(ballotId.data);
  if (!tally) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "Ballot not found" } });
    return;
  }
  const result: ApiSuccess<BallotTallyResult> = { data: tally };
  response.setHeader("Cache-Control", "no-store");
  response.json(result);
});

router.post("/tallies/:ballotId/publish", async (request, response) => {
  const ballotId = uuidSchema.safeParse(request.params.ballotId);
  if (!ballotId.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid ballot identifier" } });
    return;
  }

  const prisma = getPrismaClient();
  const ballot = await prisma.ballot.findUnique({
    where: { id: ballotId.data },
    include: {
      runoffs: { select: { id: true, title: true, startTime: true, endTime: true, roundNumber: true }, take: 1 }
    }
  });
  if (!ballot) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "Ballot not found" } });
    return;
  }

  const existingPublication = publishedBallotResult(ballot);
  if (existingPublication) {
    const result: ApiSuccess<PublishedBallotResult> = { data: existingPublication };
    response.json(result);
    return;
  }
  if (new Date() <= ballot.endTime) {
    response.status(409).json({ error: { code: "VOTING_NOT_CLOSED", message: "Results can only be published after voting closes" } });
    return;
  }

  const pendingReviews = await prisma.voteHash.count({
    where: { ballotId: ballot.id, reviewStatus: "PENDING" }
  });
  if (pendingReviews > 0) {
    response.status(409).json({
      error: { code: "ANOMALY_REVIEW_PENDING", message: `${pendingReviews} quarantined vote review${pendingReviews === 1 ? " is" : "s are"} still pending` }
    });
    return;
  }

  const tally = await calculateBallotTally(ballot.id);
  if (!tally) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "Ballot not found" } });
    return;
  }
  const snapshot = createPublishedResultSnapshot(tally);
  const publishedAt = new Date();

  await prisma.ballot.update({
    where: { id: ballot.id },
    data: {
      resultsPublishedAt: publishedAt,
      publishedResults: snapshot as unknown as Prisma.InputJsonValue
    }
  });
  const data: PublishedBallotResult = {
    ballotId: ballot.id,
    ballotTitle: ballot.title,
    publishedAt: publishedAt.toISOString(),
    roundNumber: ballot.roundNumber,
    runoffOfBallotId: ballot.runoffOfBallotId,
    runoffBallot: null,
    ...snapshot
  };
  const result: ApiSuccess<PublishedBallotResult> = { data };
  response.status(201).json(result);
});

router.post("/tallies/:ballotId/runoff", async (request, response) => {
  const ballotId = uuidSchema.safeParse(request.params.ballotId);
  const input = runoffSchema.safeParse(request.body);
  if (!ballotId.success || !input.success) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Choose a valid future opening and closing time",
        details: input.success ? undefined : input.error.flatten().fieldErrors
      }
    });
    return;
  }

  const prisma = getPrismaClient();
  const source = await prisma.ballot.findUnique({
    where: { id: ballotId.data },
    include: {
      runoffs: { select: { id: true }, take: 1 },
      candidates: {
        where: { nominationStatus: "APPROVED" },
        select: {
          id: true,
          studentId: true,
          candidacyStatement: true,
          manifestoText: true,
          aiSummary: true
        }
      }
    }
  });
  if (!source) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "Ballot not found" } });
    return;
  }
  if (source.runoffs.length > 0) {
    response.status(409).json({ error: { code: "RUNOFF_ALREADY_EXISTS", message: "A runoff has already been created for this result" } });
    return;
  }

  const snapshot = readPublishedResultSnapshot(source.publishedResults);
  if (!source.resultsPublishedAt || snapshot?.outcome !== "TIE" || snapshot.tiedCandidateIds.length < 2) {
    response.status(409).json({ error: { code: "RUNOFF_NOT_ALLOWED", message: "A runoff requires a published exact tie" } });
    return;
  }
  const tiedIds = new Set(snapshot.tiedCandidateIds);
  const tiedCandidates = source.candidates.filter(candidate => tiedIds.has(candidate.id));
  if (tiedCandidates.length !== tiedIds.size) {
    response.status(409).json({ error: { code: "TIED_CANDIDATES_CHANGED", message: "The tied candidate set is no longer complete" } });
    return;
  }

  const roundNumber = source.roundNumber + 1;
  const suffix = ` — Runoff (Round ${roundNumber})`;
  const title = `${source.title.slice(0, Math.max(1, 150 - suffix.length))}${suffix}`;

  try {
    const runoff = await prisma.$transaction(async transaction => {
      const created = await transaction.ballot.create({
        data: {
          title,
          description: source.description,
          scopeType: source.scopeType,
          scopeTarget: source.scopeTarget,
          startTime: new Date(input.data.startTime),
          endTime: new Date(input.data.endTime),
          runoffOfBallotId: source.id,
          roundNumber
        }
      });
      await transaction.candidate.createMany({
        data: tiedCandidates.map(candidate => ({
          ballotId: created.id,
          studentId: candidate.studentId,
          candidacyStatement: candidate.candidacyStatement,
          manifestoText: candidate.manifestoText,
          nominationStatus: "APPROVED",
          aiSummary: candidate.aiSummary ?? Prisma.JsonNull
        }))
      });
      return transaction.ballot.findUniqueOrThrow({
        where: { id: created.id },
        include: { _count: { select: { candidates: true, runoffs: true } } }
      });
    });
    const result: ApiSuccess<BallotRecord> = { data: ballotRecord(runoff) };
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      response.status(409).json({ error: { code: "RUNOFF_ALREADY_EXISTS", message: "A runoff has already been created for this result" } });
      return;
    }
    throw error;
  }
});

export const adminTalliesRouter = router;
