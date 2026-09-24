import assert from "node:assert/strict";
import test from "node:test";

import type { BallotTallyResult } from "@quorum/shared";
import { createPublishedResultSnapshot } from "./tally.js";

function tally(votes: number[]): BallotTallyResult {
  const acceptedVotes = votes.reduce((sum, value) => sum + value, 0);
  return {
    ballotId: "00000000-0000-4000-8000-000000000001",
    ballotTitle: "Test ballot",
    acceptedVotes,
    quarantinedVotes: 1,
    pendingReviewCount: 0,
    totalVotes: acceptedVotes + 1,
    tie: votes.length > 1 && votes[0] === votes[1],
    candidates: votes.map((voteCount, index) => ({
      candidateId: `00000000-0000-4000-8000-00000000000${index + 2}`,
      candidateName: `Candidate ${index + 1}`,
      voteCount,
      percentage: acceptedVotes === 0 ? 0 : (voteCount / acceptedVotes) * 100
    }))
  };
}

test("publishes one clear winner", () => {
  const snapshot = createPublishedResultSnapshot(tally([8, 3]));
  assert.equal(snapshot.outcome, "WINNER");
  assert.equal(snapshot.winnerCandidateId, snapshot.candidates[0]?.candidateId);
  assert.deepEqual(snapshot.tiedCandidateIds, []);
});

test("publishes every tied leader without selecting a winner", () => {
  const snapshot = createPublishedResultSnapshot(tally([5, 5, 2]));
  assert.equal(snapshot.outcome, "TIE");
  assert.equal(snapshot.winnerCandidateId, null);
  assert.deepEqual(snapshot.tiedCandidateIds, snapshot.candidates.slice(0, 2).map(candidate => candidate.candidateId));
});

test("publishes a no-votes outcome when no accepted vote exists", () => {
  const snapshot = createPublishedResultSnapshot(tally([0, 0]));
  assert.equal(snapshot.outcome, "NO_VOTES");
  assert.equal(snapshot.winnerCandidateId, null);
  assert.deepEqual(snapshot.tiedCandidateIds, []);
});
