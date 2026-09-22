import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  AdminNominationRecord,
  ApiSuccess,
  PersistedBallotPhase,
  PersistedNominationStatus
} from "@quorum/shared";
import {
  requireAdministrator,
  requireAuthentication
} from "../middleware/authentication.js";
import { getPrismaClient } from "../lib/prisma.js";
import { recordManifestoReview, storedHighlights } from "../lib/manifesto-intelligence.js";

const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z.string().trim().min(5).max(500).optional(),
  manifestoHighlights: z.tuple([
    z.string().trim().min(5).max(180),
    z.string().trim().min(5).max(180),
    z.string().trim().min(5).max(180)
  ]).optional()
}).superRefine((value, context) => {
  if (value.decision === "REJECT" && !value.rejectionReason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rejectionReason"],
      message: "A rejection reason is required"
    });
  }
  if (value.decision === "APPROVE" && !value.manifestoHighlights) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["manifestoHighlights"],
      message: "Three manifesto highlights are required"
    });
  }
});

const nominationIdSchema = z.string().uuid();
const router = Router();
router.use(requireAuthentication, requireAdministrator);

function ballotPhase(startTime: Date, endTime: Date): PersistedBallotPhase {
  const now = new Date();
  if (now < startTime) return "NOMINATIONS_OPEN";
  if (now <= endTime) return "VOTING_OPEN";
  return "CLOSED";
}

type NominationWithRelations = Prisma.CandidateGetPayload<{
  include: {
    student: {
      select: {
        id: true;
        universityId: true;
        fullName: true;
        email: true;
        department: true;
        classYear: true;
        clubMemberships: true;
      };
    };
    ballot: {
      select: {
        id: true;
        title: true;
        startTime: true;
        endTime: true;
      };
    };
  };
}>;

const nominationInclude = {
  student: {
    select: {
      id: true,
      universityId: true,
      fullName: true,
      email: true,
      department: true,
      classYear: true,
      clubMemberships: true
    }
  },
  ballot: {
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true
    }
  }
} satisfies Prisma.CandidateInclude;

function nominationResponse(nomination: NominationWithRelations): AdminNominationRecord {
  return {
    id: nomination.id,
    ballotId: nomination.ballotId,
    candidacyStatement: nomination.candidacyStatement,
    manifestoText: nomination.manifestoText,
    nominationStatus: nomination.nominationStatus as PersistedNominationStatus,
    rejectionReason: nomination.rejectionReason,
    manifestoHighlights: storedHighlights(nomination.aiSummary, nomination.manifestoText),
    createdAt: nomination.createdAt.toISOString(),
    updatedAt: nomination.updatedAt.toISOString(),
    student: nomination.student,
    ballot: {
      id: nomination.ballot.id,
      title: nomination.ballot.title,
      phase: ballotPhase(nomination.ballot.startTime, nomination.ballot.endTime),
      startTime: nomination.ballot.startTime.toISOString(),
      endTime: nomination.ballot.endTime.toISOString()
    }
  };
}

router.get("/", async (_request, response) => {
  const nominations = await getPrismaClient().candidate.findMany({
    orderBy: { createdAt: "desc" },
    include: nominationInclude
  });
  const pendingFirst = nominations.sort((left, right) => {
    if (left.nominationStatus === right.nominationStatus) return 0;
    if (left.nominationStatus === "PENDING") return -1;
    if (right.nominationStatus === "PENDING") return 1;
    return 0;
  });
  const result: ApiSuccess<AdminNominationRecord[]> = {
    data: pendingFirst.map(nominationResponse)
  };
  response.json(result);
});

router.patch("/:nominationId/review", async (request, response) => {
  const nominationId = nominationIdSchema.safeParse(request.params.nominationId);
  const review = reviewSchema.safeParse(request.body);
  if (!nominationId.success || !review.success) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Review the nomination decision and required details",
        details: review.success ? undefined : review.error.flatten().fieldErrors
      }
    });
    return;
  }

  const prisma = getPrismaClient();
  const current = await prisma.candidate.findUnique({
    where: { id: nominationId.data },
    include: {
      ballot: {
        select: { startTime: true, endTime: true }
      }
    }
  });
  if (!current) {
    response.status(404).json({ error: { code: "NOMINATION_NOT_FOUND", message: "Nomination not found" } });
    return;
  }
  if (current.nominationStatus !== "PENDING") {
    response.status(409).json({
      error: {
        code: "NOMINATION_ALREADY_REVIEWED",
        message: "This nomination has already been reviewed or withdrawn"
      }
    });
    return;
  }
  if (ballotPhase(current.ballot.startTime, current.ballot.endTime) !== "NOMINATIONS_OPEN") {
    response.status(409).json({
      error: {
        code: "NOMINATION_REVIEW_CLOSED",
        message: "Nomination decisions must be completed before voting opens"
      }
    });
    return;
  }

  const approved = review.data.decision === "APPROVE";
  const updated = await prisma.candidate.update({
    where: { id: current.id },
    data: approved
      ? {
          nominationStatus: "APPROVED",
          rejectionReason: null,
          aiSummary: recordManifestoReview(current.aiSummary, current.manifestoText, "APPROVED", review.data.manifestoHighlights)
        }
      : {
          nominationStatus: "REJECTED",
          rejectionReason: review.data.rejectionReason,
          aiSummary: recordManifestoReview(current.aiSummary, current.manifestoText, "REJECTED")
        },
    include: nominationInclude
  });

  const result: ApiSuccess<AdminNominationRecord> = { data: nominationResponse(updated) };
  response.json(result);
});

export const adminNominationsRouter = router;
