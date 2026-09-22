import type {
  ApiError,
  ApiSuccess,
  CreateStudentNominationRequest,
  StudentNominationOpportunity,
  StudentNominationRecord
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class NominationApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "NominationApiError";
  }
}

async function nominationRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...init?.headers
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new NominationApiError(
      body?.error.message ?? "The nomination request could not be completed",
      body?.error.code ?? "NOMINATION_REQUEST_FAILED",
      response.status
    );
  }

  return (await response.json()) as T;
}

export async function listNominationOpportunities(accessToken: string): Promise<StudentNominationOpportunity[]> {
  const result = await nominationRequest<ApiSuccess<StudentNominationOpportunity[]>>("/student/nominations", accessToken);
  return result.data;
}

export async function submitNomination(
  accessToken: string,
  input: CreateStudentNominationRequest
): Promise<StudentNominationRecord> {
  const result = await nominationRequest<ApiSuccess<StudentNominationRecord>>("/student/nominations", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return result.data;
}

export async function withdrawNomination(
  accessToken: string,
  nominationId: string
): Promise<StudentNominationRecord> {
  const result = await nominationRequest<ApiSuccess<StudentNominationRecord>>(
    `/student/nominations/${encodeURIComponent(nominationId)}/withdraw`,
    accessToken,
    { method: "PATCH" }
  );
  return result.data;
}
