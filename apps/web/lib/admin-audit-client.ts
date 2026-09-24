import type {
  AdminAnomalyRecord,
  ApiError,
  ApiSuccess,
  BallotRecord,
  BallotTallyResult,
  CreateRunoffRequest,
  PublishedBallotResult
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function adminRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...init?.headers
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error.message ?? "The administrative request could not be completed");
  }
  return (await response.json()) as T;
}

export async function listAdminAnomalies(accessToken: string): Promise<AdminAnomalyRecord[]> {
  const result = await adminRequest<ApiSuccess<AdminAnomalyRecord[]>>("/admin/anomalies", accessToken);
  return result.data;
}

export async function reviewAdminAnomaly(
  accessToken: string,
  id: string,
  decision: "RESTORE" | "CONFIRM",
  reason: string
): Promise<void> {
  await adminRequest(`/admin/anomalies/${id}`, accessToken, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision, reason })
  });
}

export async function loadBallotTally(accessToken: string, ballotId: string): Promise<BallotTallyResult> {
  const result = await adminRequest<ApiSuccess<BallotTallyResult>>(`/admin/tallies/${ballotId}`, accessToken);
  return result.data;
}

export async function publishBallotResults(accessToken: string, ballotId: string): Promise<PublishedBallotResult> {
  const result = await adminRequest<ApiSuccess<PublishedBallotResult>>(`/admin/tallies/${ballotId}/publish`, accessToken, {
    method: "POST"
  });
  return result.data;
}

export async function createRunoffBallot(
  accessToken: string,
  ballotId: string,
  input: CreateRunoffRequest
): Promise<BallotRecord> {
  const result = await adminRequest<ApiSuccess<BallotRecord>>(`/admin/tallies/${ballotId}/runoff`, accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return result.data;
}
