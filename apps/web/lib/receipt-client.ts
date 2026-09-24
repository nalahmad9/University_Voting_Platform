import type {
  ApiError,
  ApiSuccess,
  ReceiptVerificationResult
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ReceiptVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ReceiptVerificationError";
  }
}

export async function verifyPublicReceipt(
  receipt: string
): Promise<ReceiptVerificationResult> {
  const response = await fetch(
    `${API_BASE_URL}/public/receipts/${encodeURIComponent(receipt.trim())}`,
    {
      headers: { accept: "application/json" },
      credentials: "omit",
      cache: "no-store"
    }
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ReceiptVerificationError(
      body?.error.message ?? "The receipt could not be verified",
      body?.error.code ?? "RECEIPT_VERIFICATION_FAILED",
      response.status
    );
  }

  const result = (await response.json()) as ApiSuccess<ReceiptVerificationResult>;
  return result.data;
}
