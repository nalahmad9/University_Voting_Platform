import { Router } from "express";
import type { ApiSuccess, ReceiptVerificationResult } from "@quorum/shared";

import { getPrismaClient } from "../lib/prisma.js";
import { normalizeReceiptHash } from "../lib/receipt-verification.js";

const router = Router();

router.get("/receipts/:receipt", async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const receipt = normalizeReceiptHash(request.params.receipt);
  if (!receipt) {
    response.status(400).json({
      error: {
        code: "INVALID_RECEIPT",
        message: "Enter the complete 64-character receipt hash"
      }
    });
    return;
  }

  const vote = await getPrismaClient().voteHash.findUnique({
    where: { receiptHash: receipt },
    select: {
      receiptHash: true,
      createdAt: true,
      isQuarantined: true,
      ballot: { select: { title: true } }
    }
  });
  if (!vote) {
    response.status(404).json({
      error: {
        code: "RECEIPT_NOT_FOUND",
        message: "This receipt was not found in the anonymous ballot ledger"
      }
    });
    return;
  }

  const result: ApiSuccess<ReceiptVerificationResult> = {
    data: {
      receipt: vote.receiptHash,
      recordedAt: vote.createdAt.toISOString(),
      status: vote.isQuarantined ? "UNDER_REVIEW" : "RECORDED",
      ballotTitle: vote.ballot.title,
      revealsIdentity: false,
      revealsCandidate: false
    }
  };
  response.json(result);
});

export const publicReceiptsRouter = router;
