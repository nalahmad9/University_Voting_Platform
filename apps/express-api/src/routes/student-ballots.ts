import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  ApiSuccess,
  StudentBallotRecord,
  StudentCandidateRecord
} from "@quorum/shared";
import {
  requireAuthentication,
  type AuthenticatedRequest
} from "../middleware/authentication.js";
import { getPrismaClient } from "../lib/prisma.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";
import { storedHighlights, storedTopics } from "../lib/manifesto-intelligence.js";
import { ballotRecord } from "../lib/ballot-record.js";

const router = Router();
router.use(requireAuthentication);

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function parseCombinedScope(target: string): Map<string, string> {
  const rules = new Map<string, string>();
  for (const part of target.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    rules.set(normalize(part.slice(0, separator)), part.slice(separator + 1).trim());
  }
  return rules;
}

function classYearMatches(target: string, classYear: number): boolean {
  const match = target.match(/\d+/);
  return match ? Number(match[0]) === classYear : false;
}

export function isStudentEligible(
  ballot: { scopeType: string; scopeTarget: string | null },
  student: { department: string; classYear: number; clubMemberships: string[] }
): boolean {
  if (ballot.scopeType === "GLOBAL") return true;
  if (!ballot.scopeTarget) return false;

  if (ballot.scopeType === "DEPARTMENTAL") {
    return normalize(ballot.scopeTarget) === normalize(student.department);
  }
  if (ballot.scopeType === "SENIOR") {
    return classYearMatches(ballot.scopeTarget, student.classYear);
  }
  if (ballot.scopeType === "CLUB") {
    return student.clubMemberships.some(
      membership => normalize(membership) === normalize(ballot.scopeTarget ?? "")
    );
  }
  if (ballot.scopeType === "COMBINED") {
    const rules = parseCombinedScope(ballot.scopeTarget);
    if (rules.size === 0) return false;

    for (const [field, value] of rules) {
      if (field === "department" && normalize(value) !== normalize(student.department)) return false;
      if ((field === "classyear" || field === "year") && !classYearMatches(value, student.classYear)) return false;
      if (field === "club" && !student.clubMemberships.some(membership => normalize(membership) === normalize(value))) return false;
      if (!["department", "classyear", "year", "club"].includes(field)) return false;
    }
    return true;
  }
  return false;
}

function storageLocation(photoUrl: string): { bucket: string; path: string } | null {
  const prefix = "supabase-storage://";
  if (!photoUrl.startsWith(prefix)) return null;
  const value = photoUrl.slice(prefix.length);
  const separator = value.indexOf("/");
  if (separator < 1 || separator === value.length - 1) return null;
  return { bucket: value.slice(0, separator), path: value.slice(separator + 1) };
}

const ballotIdSchema = z.string().uuid();

async function eligibleStudentForBallot(request: AuthenticatedRequest, ballotId: string) {
  if (request.auth?.role !== "student") return { error: "STUDENT_ACCESS_REQUIRED" as const };
  const prisma = getPrismaClient();
  const [student, ballot] = await Promise.all([
    prisma.student.findUnique({
      where: { id: request.auth.sub },
      select: { department: true, classYear: true, clubMemberships: true }
    }),
    prisma.ballot.findUnique({
      where: { id: ballotId },
      select: { id: true, scopeType: true, scopeTarget: true }
    })
  ]);
  if (!student) return { error: "STUDENT_NOT_FOUND" as const };
  if (!ballot) return { error: "BALLOT_NOT_FOUND" as const };
  if (!isStudentEligible(ballot, student)) return { error: "BALLOT_NOT_ELIGIBLE" as const };
  return { student, ballot };
}

router.get("/", async (request: AuthenticatedRequest, response) => {
  if (request.auth?.role !== "student") {
    response.status(403).json({
      error: { code: "STUDENT_ACCESS_REQUIRED", message: "Student access is required" }
    });
    return;
  }

  const prisma = getPrismaClient();
  const student = await prisma.student.findUnique({
    where: { id: request.auth.sub },
    select: { department: true, classYear: true, clubMemberships: true }
  });
  if (!student) {
    response.status(404).json({
      error: { code: "STUDENT_NOT_FOUND", message: "The student account no longer exists" }
    });
    return;
  }

  const ballots = await prisma.ballot.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { candidates: true, runoffs: true } } }
  });

  const eligibleBallots: StudentBallotRecord[] = ballots
    .filter(ballot => isStudentEligible(ballot, student))
    .map(ballot => ({ ...ballotRecord(ballot), eligible: true as const }));

  const result: ApiSuccess<StudentBallotRecord[]> = { data: eligibleBallots };
  response.json(result);
});

router.get("/:ballotId/candidates", async (request: AuthenticatedRequest, response) => {
  const ballotId = ballotIdSchema.safeParse(request.params.ballotId);
  if (!ballotId.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid ballot identifier" } });
    return;
  }
  const access = await eligibleStudentForBallot(request, ballotId.data);
  if ("error" in access) {
    const status = access.error === "STUDENT_ACCESS_REQUIRED" || access.error === "BALLOT_NOT_ELIGIBLE" ? 403 : 404;
    response.status(status).json({ error: { code: access.error, message: access.error === "BALLOT_NOT_ELIGIBLE" ? "You are not eligible for this ballot" : "The ballot or student account was not found" } });
    return;
  }

  const candidates = await getPrismaClient().candidate.findMany({
    where: { ballotId: ballotId.data, nominationStatus: "APPROVED" },
    orderBy: { createdAt: "asc" },
    include: { student: { select: { id: true, fullName: true, department: true, classYear: true } } }
  });
  const data: StudentCandidateRecord[] = candidates.map(candidate => ({
    id: candidate.id,
    ballotId: candidate.ballotId,
    fullName: candidate.student.fullName,
    department: candidate.student.department,
    classYear: candidate.student.classYear,
    candidacyStatement: candidate.candidacyStatement,
    manifestoText: candidate.manifestoText,
    manifestoHighlights: storedHighlights(candidate.aiSummary, candidate.manifestoText),
    manifestoTopics: storedTopics(candidate.aiSummary, candidate.manifestoText),
    isCurrentStudent: candidate.student.id === request.auth?.sub
  }));
  const result: ApiSuccess<StudentCandidateRecord[]> = { data };
  response.json(result);
});

router.get("/:ballotId/candidates/:candidateId/photo", async (request: AuthenticatedRequest, response) => {
  const ballotId = ballotIdSchema.safeParse(request.params.ballotId);
  const candidateId = z.string().uuid().safeParse(request.params.candidateId);
  if (!ballotId.success || !candidateId.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid candidate or ballot identifier" } });
    return;
  }
  const access = await eligibleStudentForBallot(request, ballotId.data);
  if ("error" in access) {
    const status = access.error === "STUDENT_ACCESS_REQUIRED" || access.error === "BALLOT_NOT_ELIGIBLE" ? 403 : 404;
    response.status(status).json({ error: { code: access.error, message: "Candidate photo is unavailable" } });
    return;
  }
  const candidate = await getPrismaClient().candidate.findFirst({
    where: { id: candidateId.data, ballotId: ballotId.data, nominationStatus: "APPROVED" },
    select: { student: { select: { photoUrl: true } } }
  });
  const location = candidate ? storageLocation(candidate.student.photoUrl) : null;
  if (!location) {
    response.status(404).json({ error: { code: "CANDIDATE_PHOTO_NOT_FOUND", message: "Candidate photo is unavailable" } });
    return;
  }
  const { data, error } = await getSupabaseAdminClient().storage.from(location.bucket).download(location.path);
  if (error || !data) {
    response.status(502).json({ error: { code: "CANDIDATE_PHOTO_UNAVAILABLE", message: "Candidate photo could not be loaded" } });
    return;
  }
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Type", data.type || "image/jpeg");
  response.send(Buffer.from(await data.arrayBuffer()));
});

export const studentBallotsRouter = router;
