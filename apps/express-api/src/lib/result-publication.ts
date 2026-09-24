import type { Prisma } from "@prisma/client";
import type { PublishedBallotResult, PublishedResultSnapshot } from "@quorum/shared";
import { z } from "zod";

const publishedResultSchema = z.object({
  outcome: z.enum(["WINNER", "TIE", "NO_VOTES"]),
  winnerCandidateId: z.string().uuid().nullable(),
  tiedCandidateIds: z.array(z.string().uuid()),
  acceptedVotes: z.number().int().nonnegative(),
  quarantinedVotes: z.number().int().nonnegative(),
  totalVotes: z.number().int().nonnegative(),
  candidates: z.array(z.object({
    candidateId: z.string().uuid(),
    candidateName: z.string(),
    voteCount: z.number().int().nonnegative(),
    percentage: z.number().nonnegative()
  }))
}).strict();

export function readPublishedResultSnapshot(value: Prisma.JsonValue | null): PublishedResultSnapshot | null {
  const parsed = publishedResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function publishedBallotResult(ballot: {
  id: string;
  title: string;
  resultsPublishedAt: Date | null;
  publishedResults: Prisma.JsonValue | null;
  roundNumber: number;
  runoffOfBallotId: string | null;
  runoffs: Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    roundNumber: number;
  }>;
}): PublishedBallotResult | null {
  const snapshot = readPublishedResultSnapshot(ballot.publishedResults);
  if (!ballot.resultsPublishedAt || !snapshot) return null;
  const runoff = ballot.runoffs[0];
  return {
    ballotId: ballot.id,
    ballotTitle: ballot.title,
    publishedAt: ballot.resultsPublishedAt.toISOString(),
    roundNumber: ballot.roundNumber,
    runoffOfBallotId: ballot.runoffOfBallotId,
    runoffBallot: runoff ? {
      id: runoff.id,
      title: runoff.title,
      startTime: runoff.startTime.toISOString(),
      endTime: runoff.endTime.toISOString(),
      roundNumber: runoff.roundNumber
    } : null,
    ...snapshot
  };
}
