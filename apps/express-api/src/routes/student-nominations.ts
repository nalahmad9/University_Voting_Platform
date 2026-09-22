import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  ApiSuccess,
  PersistedBallotPhase,
  PersistedBallotScope,
  PersistedNominationStatus,
  StudentBallotRecord,
  StudentNominationOpportunity,
  StudentNominationRecord
} from "@quorum/shared";
import {
  requireAuthentication,
  type AuthenticatedRequest
} from "../middleware/authentication.js";
import { getPrismaClient } from "../lib/prisma.js";
import { isStudentEligible } from "./student-ballots.js";
import { generateManifestoIntelligence } from "../lib/manifesto-intelligence.js";

const createNominationSchema = z.object({
  ballotId: z.string().uuid(),
  candidacyStatement: z.string().trim().min(20).max(140),
  manifestoText: z.string().trim().min(100).max(2000)
});

const nominationIdSchema = z.string().uuid();
const router = Router();
router.use(requireAuthentication);

function requireStudent(request: AuthenticatedRequest, response: Parameters<Parameters<typeof router.get>[1]>[1]): request is AuthenticatedRequest & { auth: { role: "student"; sub: string; universityId: string; type: "access" } } {
  if (request.auth?.role !== "student") {
    response.status(403).json({
      error: { code: "STUDENT_ACCESS_REQUIRED", message: "Student access is required" }
    });
    return false;
  }
  return true;
}

function ballotPhase(startTime: Date, endTime: Date): PersistedBallotPhase {
  const now = new Date();
  if (now < startTime) return "NOMINATIONS_OPEN";
  if (now <= endTime) return "VOTING_OPEN";
  return "CLOSED";
}

function ballotRecord(ballot: {
  id: string;
  title: string;
  description: string | null;
  scopeType: string;
  scopeTarget: string | null;
  startTime: Date;
  endTime: Date;
  createdAt: Date;
  _count: { candidates: number };
}): StudentBallotRecord {
  return {
    id: ballot.id,
    title: ballot.title,
    description: ballot.description,
    scopeType: ballot.scopeType as PersistedBallotScope,
    scopeTarget: ballot.scopeTarget,
    startTime: ballot.startTime.toISOString(),
    endTime: ballot.endTime.toISOString(),
    createdAt: ballot.createdAt.toISOString(),
    phase: ballotPhase(ballot.startTime, ballot.endTime),
    candidateCount: ballot._count.candidates,
    eligible: true
  };
}

function nominationRecord(nomination: {
  id: string;
  ballotId: string;
  candidacyStatement: string;
  manifestoText: string;
  nominationStatus: string;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StudentNominationRecord {
  return {
    id: nomination.id,
    ballotId: nomination.ballotId,
    candidacyStatement: nomination.candidacyStatement,
    manifestoText: nomination.manifestoText,
    nominationStatus: nomination.nominationStatus as PersistedNominationStatus,
    rejectionReason: nomination.rejectionReason,
    createdAt: nomination.createdAt.toISOString(),
    updatedAt: nomination.updatedAt.toISOString()
  };
}

router.get("/", async (request: AuthenticatedRequest, response) => {
  if (!requireStudent(request, response)) return;
  const prisma = getPrismaClient();
  const student = await prisma.student.findUnique({
    where: { id: request.auth.sub },
    select: { department: true, classYear: true, clubMemberships: true }
  });
  if (!student) {
    response.status(404).json({ error: { code: "STUDENT_NOT_FOUND", message: "The student account no longer exists" } });
    return;
  }

  const ballots = await prisma.ballot.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { candidates: true } } }
  });
  const eligible = ballots.filter(ballot => isStudentEligible(ballot, student));
  const nominations = await prisma.candidate.findMany({
    where: { studentId: request.auth.sub, ballotId: { in: eligible.map(ballot => ballot.id) } }
  });
  const byBallot = new Map(nominations.map(nomination => [nomination.ballotId, nomination]));
  const opportunities: StudentNominationOpportunity[] = eligible.map(ballot => {
    const nomination = byBallot.get(ballot.id);
    return {
      ballot: ballotRecord(ballot),
      nomination: nomination ? nominationRecord(nomination) : null,
      canNominate: ballotPhase(ballot.startTime, ballot.endTime) === "NOMINATIONS_OPEN"
        && (!nomination || ["REJECTED", "WITHDRAWN"].includes(nomination.nominationStatus))
    };
  });

  const result: ApiSuccess<StudentNominationOpportunity[]> = { data: opportunities };
  response.json(result);
});

router.post("/", async (request: AuthenticatedRequest, response) => {
  if (!requireStudent(request, response)) return;
  const parsed = createNominationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Review your candidacy statement and manifesto",
        details: parsed.error.flatten().fieldErrors
      }
    });
    return;
  }

  const prisma = getPrismaClient();
  const [student, ballot, existing] = await Promise.all([
    prisma.student.findUnique({
      where: { id: request.auth.sub },
      select: { department: true, classYear: true, clubMemberships: true }
    }),
    prisma.ballot.findUnique({
      where: { id: parsed.data.ballotId },
      include: { _count: { select: { candidates: true } } }
    }),
    prisma.candidate.findUnique({
      where: { ballotId_studentId: { ballotId: parsed.data.ballotId, studentId: request.auth.sub } }
    })
  ]);

  if (!student || !ballot) {
    response.status(404).json({ error: { code: "BALLOT_NOT_FOUND", message: "This ballot is not available" } });
    return;
  }
  if (!isStudentEligible(ballot, student)) {
    response.status(403).json({ error: { code: "NOT_ELIGIBLE", message: "You are not eligible for this ballot" } });
    return;
  }
  if (ballotPhase(ballot.startTime, ballot.endTime) !== "NOMINATIONS_OPEN") {
    response.status(409).json({ error: { code: "NOMINATIONS_CLOSED", message: "Nominations are no longer open for this ballot" } });
    return;
  }
  if (existing && ["PENDING", "APPROVED"].includes(existing.nominationStatus)) {
    response.status(409).json({ error: { code: "NOMINATION_EXISTS", message: "You already have an active nomination for this ballot" } });
    return;
  }

  const cycleConflict = await prisma.candidate.findFirst({
    where: {
      studentId: request.auth.sub,
      ballotId: { not: ballot.id },
      nominationStatus: { in: ["PENDING", "APPROVED"] },
      ballot: { endTime: { gt: new Date() } }
    },
    select: { id: true }
  });
  if (cycleConflict) {
    response.status(409).json({
      error: {
        code: "NOMINATION_CYCLE_CONFLICT",
        message: "You already have an active nomination in the current election period"
      }
    });
    return;
  }

  try {
    const manifestoIntelligence = await generateManifestoIntelligence(parsed.data.manifestoText);
    const nomination = existing
      ? await prisma.candidate.update({
          where: { id: existing.id },
          data: {
            candidacyStatement: parsed.data.candidacyStatement,
            manifestoText: parsed.data.manifestoText,
            nominationStatus: "PENDING",
            rejectionReason: null,
            aiSummary: manifestoIntelligence
          }
        })
      : await prisma.candidate.create({
          data: {
            ballotId: ballot.id,
            studentId: request.auth.sub,
            candidacyStatement: parsed.data.candidacyStatement,
            manifestoText: parsed.data.manifestoText,
            aiSummary: manifestoIntelligence
          }
        });
    const result: ApiSuccess<StudentNominationRecord> = { data: nominationRecord(nomination) };
    response.status(existing ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      response.status(409).json({ error: { code: "NOMINATION_EXISTS", message: "You already nominated yourself for this ballot" } });
      return;
    }
    throw error;
  }
});

router.patch("/:nominationId/withdraw", async (request: AuthenticatedRequest, response) => {
  if (!requireStudent(request, response)) return;
  const nominationId = nominationIdSchema.safeParse(request.params.nominationId);
  if (!nominationId.success) {
    response.status(400).json({ error: { code: "INVALID_NOMINATION", message: "The nomination reference is invalid" } });
    return;
  }

  const prisma = getPrismaClient();
  const nomination = await prisma.candidate.findFirst({
    where: { id: nominationId.data, studentId: request.auth.sub }
  });
  if (!nomination) {
    response.status(404).json({ error: { code: "NOMINATION_NOT_FOUND", message: "Nomination not found" } });
    return;
  }
  if (nomination.nominationStatus !== "PENDING") {
    response.status(409).json({ error: { code: "WITHDRAWAL_NOT_ALLOWED", message: "Only a pending nomination can be withdrawn" } });
    return;
  }

  const withdrawn = await prisma.candidate.update({
    where: { id: nomination.id },
    data: { nominationStatus: "WITHDRAWN" }
  });
  const result: ApiSuccess<StudentNominationRecord> = { data: nominationRecord(withdrawn) };
  response.json(result);
});

export const studentNominationsRouter = router;
