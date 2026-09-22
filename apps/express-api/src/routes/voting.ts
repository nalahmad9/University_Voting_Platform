import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type {
  ApiSuccess,
  BlindTokenIssuanceResult,
  CastVoteResult,
  VotingKeyRecord
} from "@quorum/shared";
import { verifyLivenessProof } from "../auth/jwt.js";
import {
  requireAuthentication,
  type AuthenticatedRequest
} from "../middleware/authentication.js";
import {
  BLIND_KEY_VERSION,
  BLIND_SIGNATURE_SUITE,
  blindSuite,
  decodeBase64Url,
  encodeBase64Url,
  getBallotKeyPair,
  sha256Hex,
  voteTokenMessage
} from "../lib/blind-voting.js";
import { getPrismaClient } from "../lib/prisma.js";
import { isStudentEligible } from "./student-ballots.js";

const router = Router();
const uuidSchema = z.string().uuid();
const base64UrlSchema = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/);

const requestTokenSchema = z.object({
  ballotId: z.string().uuid(),
  blindedToken: base64UrlSchema,
  keyVersion: z.literal(BLIND_KEY_VERSION),
  idempotencyKey: z.string().trim().min(16).max(128),
  livenessProof: z.string().min(1).max(4096)
});

const castVoteSchema = z.object({
  ballotId: z.string().uuid(),
  candidateId: z.string().uuid(),
  token: base64UrlSchema,
  signature: base64UrlSchema,
  keyVersion: z.literal(BLIND_KEY_VERSION),
  expiresAt: z.string().datetime(),
  timeTakenSeconds: z.number().int().min(1).max(3600),
  riskFeatures: z.object({
    deviceClass: z.enum(["desktop", "mobile", "tablet", "unknown"]),
    completionDurationBand: z.enum(["under_20_seconds", "20_to_60_seconds", "over_60_seconds"]),
    replayIndicator: z.boolean()
  }).strict()
}).strict();

function votingIsOpen(ballot: { startTime: Date; endTime: Date }): boolean {
  const now = new Date();
  return now >= ballot.startTime && now <= ballot.endTime;
}

function anomalyScore(features: z.infer<typeof castVoteSchema>["riskFeatures"]): number {
  let score = 0;
  if (features.completionDurationBand === "under_20_seconds") score += 0.35;
  if (features.deviceClass === "unknown") score += 0.1;
  if (features.replayIndicator) score += 0.8;
  return Math.min(1, score);
}

router.get("/voting/ballots/:ballotId/key", async (request, response) => {
  const ballotId = uuidSchema.safeParse(request.params.ballotId);
  if (!ballotId.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid ballot identifier" } });
    return;
  }
  const ballot = await getPrismaClient().ballot.findUnique({
    where: { id: ballotId.data },
    select: { id: true, endTime: true }
  });
  if (!ballot) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "Ballot not found" } });
    return;
  }
  const keys = await getBallotKeyPair(ballot.id);
  const result: ApiSuccess<VotingKeyRecord> = {
    data: {
      ballotId: ballot.id,
      keyVersion: BLIND_KEY_VERSION,
      expiresAt: ballot.endTime.toISOString(),
      suite: BLIND_SIGNATURE_SUITE,
      publicKey: keys.publicKey
    }
  };
  response.setHeader("Cache-Control", "public, max-age=300");
  response.json(result);
});

router.post("/request-token", requireAuthentication, async (request: AuthenticatedRequest, response) => {
  if (request.auth?.role !== "student") {
    response.status(403).json({ error: { code: "STUDENT_ACCESS_REQUIRED", message: "Student access is required" } });
    return;
  }
  const input = requestTokenSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "The voting authorization request is invalid" } });
    return;
  }

  let liveness;
  try {
    liveness = verifyLivenessProof(input.data.livenessProof);
  } catch {
    response.status(403).json({ error: { code: "LIVENESS_REQUIRED", message: "Complete the identity and presence check again" } });
    return;
  }
  if (liveness.sub !== request.auth.sub || liveness.ballotId !== input.data.ballotId) {
    response.status(403).json({ error: { code: "LIVENESS_PROOF_MISMATCH", message: "The presence check does not match this ballot" } });
    return;
  }

  const prisma = getPrismaClient();
  const [student, ballot, approvedCandidacy] = await Promise.all([
    prisma.student.findUnique({
      where: { id: request.auth.sub },
      select: { department: true, classYear: true, clubMemberships: true }
    }),
    prisma.ballot.findUnique({
      where: { id: input.data.ballotId },
      select: { id: true, scopeType: true, scopeTarget: true, startTime: true, endTime: true }
    }),
    prisma.candidate.findFirst({
      where: {
        ballotId: input.data.ballotId,
        studentId: request.auth.sub,
        nominationStatus: "APPROVED"
      },
      select: { id: true }
    })
  ]);
  if (!student || !ballot || !isStudentEligible(ballot, student)) {
    response.status(403).json({ error: { code: "BALLOT_NOT_ELIGIBLE", message: "You are not eligible for this ballot" } });
    return;
  }
  if (!votingIsOpen(ballot)) {
    response.status(409).json({ error: { code: "VOTING_NOT_OPEN", message: "Voting is not open for this ballot" } });
    return;
  }
  if (approvedCandidacy) {
    response.status(403).json({
      error: {
        code: "CANDIDATE_VOTING_NOT_ALLOWED",
        message: "Candidates cannot vote in a ballot where they are standing"
      }
    });
    return;
  }

  const blindedToken = decodeBase64Url(input.data.blindedToken);
  if (blindedToken.byteLength !== 256) {
    response.status(400).json({ error: { code: "MALFORMED_BLINDED_TOKEN", message: "The blinded voting token is malformed" } });
    return;
  }
  const blindedRequestDigest = sha256Hex(blindedToken);
  const idempotencyKeyDigest = sha256Hex(input.data.idempotencyKey);
  const existing = await prisma.voterLog.findFirst({
    where: { studentId: request.auth.sub, ballotId: ballot.id }
  });
  if (existing && (existing.blindedRequestDigest !== blindedRequestDigest || existing.idempotencyKeyDigest !== idempotencyKeyDigest)) {
    response.status(409).json({ error: { code: "TOKEN_ALREADY_ISSUED", message: "A voting authorization was already issued for this ballot" } });
    return;
  }
  if (!existing) {
    try {
      await prisma.voterLog.create({
        data: {
          studentId: request.auth.sub,
          ballotId: ballot.id,
          blindedRequestDigest,
          idempotencyKeyDigest
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const concurrent = await prisma.voterLog.findFirst({
        where: { studentId: request.auth.sub, ballotId: ballot.id }
      });
      if (!concurrent || concurrent.blindedRequestDigest !== blindedRequestDigest || concurrent.idempotencyKeyDigest !== idempotencyKeyDigest) {
        response.status(409).json({ error: { code: "TOKEN_ALREADY_ISSUED", message: "A voting authorization was already issued for this ballot" } });
        return;
      }
    }
  }

  const keys = await getBallotKeyPair(ballot.id);
  const blindSignature = await blindSuite.blindSign(keys.privateCryptoKey, blindedToken);
  const result: ApiSuccess<BlindTokenIssuanceResult> = {
    data: {
      blindSignature: encodeBase64Url(blindSignature),
      keyVersion: BLIND_KEY_VERSION,
      expiresAt: ballot.endTime.toISOString()
    }
  };
  response.setHeader("Cache-Control", "no-store");
  response.json(result);
});

router.post("/cast-vote", async (request, response) => {
  if (request.header("authorization") || request.header("cookie")) {
    response.status(400).json({ error: { code: "CREDENTIALS_NOT_ALLOWED", message: "Anonymous vote submission must not include login credentials" } });
    return;
  }
  const input = castVoteSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "The anonymous ballot is malformed" } });
    return;
  }
  const prisma = getPrismaClient();
  const [ballot, candidate] = await Promise.all([
    prisma.ballot.findUnique({ where: { id: input.data.ballotId }, select: { id: true, startTime: true, endTime: true } }),
    prisma.candidate.findFirst({
      where: { id: input.data.candidateId, ballotId: input.data.ballotId, nominationStatus: "APPROVED" },
      select: { id: true }
    })
  ]);
  if (!ballot) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "Ballot not found" } });
    return;
  }
  if (!candidate) {
    response.status(422).json({ error: { code: "INELIGIBLE_CANDIDATE", message: "This candidate is not eligible for the ballot" } });
    return;
  }
  const expectedExpiry = ballot.endTime.toISOString();
  if (input.data.expiresAt !== expectedExpiry || new Date() > ballot.endTime || !votingIsOpen(ballot)) {
    response.status(409).json({ error: { code: "TOKEN_EXPIRED", message: "This voting authorization has expired" } });
    return;
  }

  const token = decodeBase64Url(input.data.token);
  const signature = decodeBase64Url(input.data.signature);
  if (token.byteLength !== 32 || signature.byteLength !== 256) {
    response.status(400).json({ error: { code: "MALFORMED_VOTE_TOKEN", message: "The voting authorization is malformed" } });
    return;
  }
  const message = voteTokenMessage({
    ballotId: ballot.id,
    keyVersion: input.data.keyVersion,
    expiresAt: input.data.expiresAt,
    token: input.data.token
  });
  const keys = await getBallotKeyPair(ballot.id);
  const signatureIsValid = await blindSuite.verify(keys.publicCryptoKey, signature, message);
  if (!signatureIsValid) {
    response.status(403).json({ error: { code: "INVALID_VOTE_SIGNATURE", message: "The voting authorization is invalid" } });
    return;
  }

  const tokenDigest = sha256Hex(token);
  const receipt = randomBytes(32).toString("hex");
  const score = anomalyScore(input.data.riskFeatures);
  const isQuarantined = score >= 0.75;
  try {
    const vote = await prisma.$transaction(async transaction => transaction.voteHash.create({
      data: {
        ballotId: ballot.id,
        candidateId: candidate.id,
        tokenDigest,
        receiptHash: receipt,
        timeTakenSeconds: input.data.timeTakenSeconds,
        anomalyScore: new Prisma.Decimal(score),
        isQuarantined
      },
      select: { createdAt: true }
    }));
    const result: ApiSuccess<CastVoteResult> = {
      data: {
        receipt,
        recordedAt: vote.createdAt.toISOString(),
        status: isQuarantined ? "QUARANTINED" : "RECORDED"
      }
    };
    response.setHeader("Cache-Control", "no-store");
    response.status(201).json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      response.status(409).json({ error: { code: "TOKEN_ALREADY_SPENT", message: "This voting authorization has already been used" } });
      return;
    }
    throw error;
  }
});

export const votingRouter = router;
