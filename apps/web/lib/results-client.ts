import type { ApiError, ApiSuccess, PublishedBallotResult } from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function publicRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error.message ?? "Published results could not be loaded");
  }
  return (await response.json()) as T;
}

export async function listPublishedResults(): Promise<PublishedBallotResult[]> {
  const result = await publicRequest<ApiSuccess<PublishedBallotResult[]>>("/public/results");
  return result.data;
}

export async function getPublishedResult(ballotId: string): Promise<PublishedBallotResult> {
  const result = await publicRequest<ApiSuccess<PublishedBallotResult>>(`/public/results/${ballotId}`);
  return result.data;
}
