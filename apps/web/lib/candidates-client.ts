import type { ApiError, ApiSuccess, StudentCandidateRecord } from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function authenticatedRequest(path: string, accessToken: string): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { accept: "application/json", authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error.message ?? "Candidate information could not be loaded");
  }
  return response;
}

export async function listApprovedCandidates(ballotId: string, accessToken: string): Promise<StudentCandidateRecord[]> {
  const response = await authenticatedRequest(`/student/ballots/${encodeURIComponent(ballotId)}/candidates`, accessToken);
  const result = (await response.json()) as ApiSuccess<StudentCandidateRecord[]>;
  return result.data;
}

export async function loadCandidatePhoto(ballotId: string, candidateId: string, accessToken: string): Promise<string> {
  const response = await authenticatedRequest(`/student/ballots/${encodeURIComponent(ballotId)}/candidates/${encodeURIComponent(candidateId)}/photo`, accessToken);
  return URL.createObjectURL(await response.blob());
}
