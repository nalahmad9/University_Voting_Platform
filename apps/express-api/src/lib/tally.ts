import { Prisma } from "@prisma/client";
import type { BallotTallyResult, PublishedResultSnapshot } from "@quorum/shared";

import { getPrismaClient } from "./prisma.js";

export async function calculateBallotTally(ballotId: string): Promise<BallotTallyResult | null> {
  const prisma = getPrismaClient();
  const ballot = await prisma.ballot.findUnique({
    where: { id: ballotId },
    select: { title: true }
  });
  if (!ballot) return null;

  const rows = await prisma.$queryRaw<Array<{
    candidate_id: string;
    candidate_name: string;
    vote_count: number;
  }>>(Prisma.sql`
    select c.id as candidate_id, s.full_name as candidate_name, count(v.id)::int as vote_count
      from public.candidates c
      join public.students s on s.id = c.student_id
      left join public.vote_hashes v
        on v.ballot_id = c.ballot_id
       and v.candidate_id = c.id
       and v.is_quarantined = false
     where c.ballot_id = ${ballotId}::uuid
       and c.nomination_status = 'APPROVED'
     group by c.id, s.full_name, c.created_at
     order by vote_count desc, c.created_at asc
  `);
  const counts = await prisma.voteHash.groupBy({
    by: ["isQuarantined"],
    where: { ballotId },
    _count: { _all: true }
  });
  const acceptedVotes = counts.find(item => !item.isQuarantined)?._count._all ?? 0;
  const quarantinedVotes = counts.find(item => item.isQuarantined)?._count._all ?? 0;
  const pendingReviewCount = await prisma.voteHash.count({
    where: { ballotId, reviewStatus: "PENDING" }
  });
  const candidates = rows.map(row => ({
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    voteCount: row.vote_count,
    percentage: acceptedVotes === 0 ? 0 : Number(((row.vote_count / acceptedVotes) * 100).toFixed(1))
  }));
  const leading = candidates[0]?.voteCount ?? 0;

  return {
    ballotId,
    ballotTitle: ballot.title,
    acceptedVotes,
    quarantinedVotes,
    pendingReviewCount,
    totalVotes: acceptedVotes + quarantinedVotes,
    candidates,
    tie: leading > 0 && candidates.filter(candidate => candidate.voteCount === leading).length > 1
  };
}

export function createPublishedResultSnapshot(tally: BallotTallyResult): PublishedResultSnapshot {
  const leadingVoteCount = tally.candidates[0]?.voteCount ?? 0;
  const tiedCandidateIds = leadingVoteCount > 0
    ? tally.candidates
        .filter(candidate => candidate.voteCount === leadingVoteCount)
        .map(candidate => candidate.candidateId)
    : [];

  const outcome = tally.acceptedVotes === 0
    ? "NO_VOTES"
    : tiedCandidateIds.length > 1
      ? "TIE"
      : "WINNER";

  return {
    outcome,
    winnerCandidateId: outcome === "WINNER" ? tiedCandidateIds[0] ?? null : null,
    tiedCandidateIds: outcome === "TIE" ? tiedCandidateIds : [],
    acceptedVotes: tally.acceptedVotes,
    quarantinedVotes: tally.quarantinedVotes,
    totalVotes: tally.totalVotes,
    candidates: tally.candidates
  };
}
