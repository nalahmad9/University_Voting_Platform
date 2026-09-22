import type { ApiError, ApiSuccess, LivenessCompletionResult } from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class FaceReferenceError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "FaceReferenceError";
  }
}

export async function loadFaceReference(accessToken: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/student/verification/face-reference`, {
    headers: {
      accept: "image/jpeg,image/png,image/webp",
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new FaceReferenceError(
      body?.error.message ?? "Your registered profile photo could not be loaded",
      response.status
    );
  }
  return response.blob();
}

export async function registerLivenessCompletion(
  accessToken: string,
  ballotId: string,
  matchDistance: number
): Promise<LivenessCompletionResult> {
  const response = await fetch(`${API_BASE_URL}/student/verification/liveness-complete`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    credentials: "omit",
    body: JSON.stringify({ ballotId, matchDistance })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new FaceReferenceError(body?.error.message ?? "The presence check could not be recorded", response.status);
  }
  return ((await response.json()) as ApiSuccess<LivenessCompletionResult>).data;
}
