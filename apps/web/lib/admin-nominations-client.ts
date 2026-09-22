import type {
  AdminNominationRecord,
  ApiError,
  ApiSuccess,
  ReviewNominationRequest
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class AdminNominationApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AdminNominationApiError";
  }
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
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
    throw new AdminNominationApiError(
      body?.error.message ?? "The nomination review could not be completed",
      body?.error.code ?? "ADMIN_NOMINATION_REQUEST_FAILED",
      response.status
    );
  }
  return (await response.json()) as T;
}

export async function listAdminNominations(accessToken: string): Promise<AdminNominationRecord[]> {
  const result = await request<ApiSuccess<AdminNominationRecord[]>>("/admin/nominations", accessToken);
  return result.data;
}

export async function reviewAdminNomination(
  accessToken: string,
  nominationId: string,
  input: ReviewNominationRequest
): Promise<AdminNominationRecord> {
  const result = await request<ApiSuccess<AdminNominationRecord>>(
    `/admin/nominations/${encodeURIComponent(nominationId)}/review`,
    accessToken,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
  return result.data;
}
