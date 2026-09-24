import { Router } from "express";
import { z } from "zod";
import type { ApiSuccess, PublishedBallotResult } from "@quorum/shared";

import { getPrismaClient } from "../lib/prisma.js";
import { publishedBallotResult } from "../lib/result-publication.js";

const router = Router();
const uuidSchema = z.string().uuid();
const publicationInclude = {
  runoffs: {
    select: { id: true, title: true, startTime: true, endTime: true, roundNumber: true },
    take: 1
  }
} as const;

router.get("/results", async (_request, response) => {
  const ballots = await getPrismaClient().ballot.findMany({
    where: { resultsPublishedAt: { not: null } },
    orderBy: { resultsPublishedAt: "desc" },
    include: publicationInclude
  });
  const data = ballots
    .map(publishedBallotResult)
    .filter((item): item is PublishedBallotResult => item !== null);
  const result: ApiSuccess<PublishedBallotResult[]> = { data };
  response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  response.json(result);
});

router.get("/results/:ballotId", async (request, response) => {
  const ballotId = uuidSchema.safeParse(request.params.ballotId);
  if (!ballotId.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid ballot identifier" } });
    return;
  }
  const ballot = await getPrismaClient().ballot.findFirst({
    where: { id: ballotId.data, resultsPublishedAt: { not: null } },
    include: publicationInclude
  });
  const data = ballot ? publishedBallotResult(ballot) : null;
  if (!data) {
    response.status(404).json({ error: { code: "RESULTS_NOT_PUBLISHED", message: "Published results were not found for this ballot" } });
    return;
  }
  const result: ApiSuccess<PublishedBallotResult> = { data };
  response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  response.json(result);
});

export const publicResultsRouter = router;
