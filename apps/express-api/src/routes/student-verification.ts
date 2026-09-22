import { Router } from "express";
import {
  requireAuthentication,
  type AuthenticatedRequest
} from "../middleware/authentication.js";
import { getPrismaClient } from "../lib/prisma.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";
import { z } from "zod";
import type { ApiSuccess, LivenessCompletionResult } from "@quorum/shared";
import { issueLivenessProof } from "../auth/jwt.js";
import { isStudentEligible } from "./student-ballots.js";

const router = Router();
router.use(requireAuthentication);

const livenessCompletionSchema = z.object({
  ballotId: z.string().uuid(),
  matchDistance: z.number().finite().min(0).max(0.48)
});

function storageLocation(photoUrl: string): { bucket: string; path: string } | null {
  const prefix = "supabase-storage://";
  if (!photoUrl.startsWith(prefix)) return null;
  const value = photoUrl.slice(prefix.length);
  const separator = value.indexOf("/");
  if (separator < 1 || separator === value.length - 1) return null;
  return { bucket: value.slice(0, separator), path: value.slice(separator + 1) };
}

router.get("/face-reference", async (request: AuthenticatedRequest, response) => {
  if (request.auth?.role !== "student") {
    response.status(403).json({
      error: { code: "STUDENT_ACCESS_REQUIRED", message: "Student access is required" }
    });
    return;
  }

  const student = await getPrismaClient().student.findUnique({
    where: { id: request.auth.sub },
    select: { photoUrl: true }
  });
  if (!student) {
    response.status(404).json({ error: { code: "STUDENT_NOT_FOUND", message: "Student account not found" } });
    return;
  }

  const location = storageLocation(student.photoUrl);
  if (!location) {
    response.status(422).json({
      error: { code: "PROFILE_PHOTO_UNAVAILABLE", message: "Your registered profile photo is unavailable" }
    });
    return;
  }

  const { data, error } = await getSupabaseAdminClient().storage
    .from(location.bucket)
    .download(location.path);
  if (error || !data) {
    response.status(502).json({
      error: { code: "PROFILE_PHOTO_UNAVAILABLE", message: "Your registered profile photo could not be loaded" }
    });
    return;
  }

  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Content-Type", data.type || "image/jpeg");
  response.send(Buffer.from(await data.arrayBuffer()));
});

router.post("/liveness-complete", async (request: AuthenticatedRequest, response) => {
  if (request.auth?.role !== "student") {
    response.status(403).json({ error: { code: "STUDENT_ACCESS_REQUIRED", message: "Student access is required" } });
    return;
  }
  const input = livenessCompletionSchema.safeParse(request.body);
  if (!input.success) {
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid liveness completion" } });
    return;
  }
  const prisma = getPrismaClient();
  const [student, ballot] = await Promise.all([
    prisma.student.findUnique({
      where: { id: request.auth.sub },
      select: { department: true, classYear: true, clubMemberships: true }
    }),
    prisma.ballot.findUnique({
      where: { id: input.data.ballotId },
      select: { id: true, scopeType: true, scopeTarget: true, startTime: true, endTime: true }
    })
  ]);
  if (!student || !ballot || !isStudentEligible(ballot, student)) {
    response.status(403).json({ error: { code: "BALLOT_NOT_ELIGIBLE", message: "You are not eligible for this ballot" } });
    return;
  }
  const now = new Date();
  if (now < ballot.startTime || now > ballot.endTime) {
    response.status(409).json({ error: { code: "VOTING_NOT_OPEN", message: "Voting is not open for this ballot" } });
    return;
  }
  const result: ApiSuccess<LivenessCompletionResult> = {
    data: { proof: issueLivenessProof(request.auth.sub, ballot.id), expiresInSeconds: 300 }
  };
  response.json(result);
});

export const studentVerificationRouter = router;
