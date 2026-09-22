import type {
  ApiError,
  ApiSuccess,
  BallotRecord,
  CreateBallotRequest,
  StudentBallotRecord
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class BallotApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "BallotApiError";
  }
}

async function ballotRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
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
    throw new BallotApiError(
      body?.error.message ?? "The ballot request could not be completed",
      body?.error.code ?? "BALLOT_REQUEST_FAILED",
      response.status
    );
  }

  return (await response.json()) as T;
}

export async function createBallot(
  accessToken: string,
  input: CreateBallotRequest
): Promise<BallotRecord> {
  const result = await ballotRequest<ApiSuccess<BallotRecord>>("/admin/ballots", accessToken, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return result.data;
}

export async function listAdministratorBallots(accessToken: string): Promise<BallotRecord[]> {
  const result = await ballotRequest<ApiSuccess<BallotRecord[]>>("/admin/ballots", accessToken);
  return result.data;
}

export async function listStudentBallots(accessToken: string): Promise<StudentBallotRecord[]> {
  const result = await ballotRequest<ApiSuccess<StudentBallotRecord[]>>("/student/ballots", accessToken);
  return result.data;
}
