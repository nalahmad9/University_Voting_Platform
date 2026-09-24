import type {
  BallotRecord,
  PersistedBallotPhase,
  PersistedBallotScope
} from "@quorum/shared";

export function ballotPhase(
  startTime: Date,
  endTime: Date,
  runoffOfBallotId: string | null = null
): PersistedBallotPhase {
  const now = new Date();
  if (now < startTime) return runoffOfBallotId ? "UPCOMING" : "NOMINATIONS_OPEN";
  if (now <= endTime) return "VOTING_OPEN";
  return "CLOSED";
}

export function ballotRecord(ballot: {
  id: string;
  title: string;
  description: string | null;
  scopeType: string;
  scopeTarget: string | null;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  resultsPublishedAt: Date | null;
  runoffOfBallotId: string | null;
  roundNumber: number;
  _count: { candidates: number; runoffs: number };
}): BallotRecord {
  return {
    id: ballot.id,
    title: ballot.title,
    description: ballot.description,
    scopeType: ballot.scopeType as PersistedBallotScope,
    scopeTarget: ballot.scopeTarget,
    startTime: ballot.startTime.toISOString(),
    endTime: ballot.endTime.toISOString(),
    createdAt: ballot.createdAt.toISOString(),
    phase: ballotPhase(ballot.startTime, ballot.endTime, ballot.runoffOfBallotId),
    candidateCount: ballot._count.candidates,
    resultsPublishedAt: ballot.resultsPublishedAt?.toISOString() ?? null,
    runoffOfBallotId: ballot.runoffOfBallotId,
    roundNumber: ballot.roundNumber,
    hasRunoff: ballot._count.runoffs > 0
  };
}
