import type {
  ApiError,
  ApiSuccess,
  AuthenticatedAdministrator,
  AuthenticatedStudent,
  LoginResult
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const SESSION_KEY = "quorum-session";

export type StudentSession = {
  role: "student";
  accessToken: string;
  user: AuthenticatedStudent;
  issuedAt: number;
};

export type AdministratorSession = {
  role: "admin";
  accessToken: string;
  user: AuthenticatedAdministrator;
  issuedAt: number;
};

export type QuorumSession = StudentSession | AdministratorSession;

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...init?.headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiError | null;
      throw new AuthenticationError(
        body?.error.message ?? "The authentication service could not complete the request",
        body?.error.code ?? "AUTHENTICATION_REQUEST_FAILED",
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AuthenticationError("The authentication service timed out", "AUTHENTICATION_TIMEOUT", 0);
    }
    throw new AuthenticationError(
      "Cannot reach the authentication service. Make sure the API is running.",
      "AUTHENTICATION_UNAVAILABLE",
      0
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function login(identifier: string, password: string): Promise<QuorumSession> {
  const result = await apiRequest<ApiSuccess<LoginResult>>("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });

  if (result.data.user.role === "student") {
    return {
      role: "student",
      accessToken: result.data.accessToken,
      user: result.data.user,
      issuedAt: Date.now()
    };
  }

  return {
    role: "admin",
    accessToken: result.data.accessToken,
    user: result.data.user,
    issuedAt: Date.now()
  };
}

export async function restoreStudentSession(session: StudentSession): Promise<StudentSession> {
  const result = await apiRequest<ApiSuccess<AuthenticatedStudent>>("/auth/me", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  return { ...session, user: result.data };
}

export async function restoreAdministratorSession(session: AdministratorSession): Promise<AdministratorSession> {
  const result = await apiRequest<ApiSuccess<AuthenticatedAdministrator>>("/auth/admin/me", {
    headers: { authorization: `Bearer ${session.accessToken}` }
  });
  return { ...session, user: result.data };
}

export async function notifyLogout(accessToken: string): Promise<void> {
  await apiRequest<void>("/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` }
  });
}

export function readStoredSession(): QuorumSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const candidate = JSON.parse(raw) as Partial<QuorumSession>;
    if (
      candidate.role === "admin" &&
      typeof (candidate as Partial<AdministratorSession>).accessToken === "string" &&
      typeof (candidate as Partial<AdministratorSession>).user === "object" &&
      typeof candidate.issuedAt === "number"
    ) {
      return candidate as AdministratorSession;
    }
    if (
      candidate.role === "student" &&
      typeof (candidate as Partial<StudentSession>).accessToken === "string" &&
      typeof (candidate as Partial<StudentSession>).user === "object" &&
      typeof candidate.issuedAt === "number"
    ) {
      return candidate as StudentSession;
    }
  } catch {
    // Invalid browser state is treated as a signed-out session.
  }
  return null;
}

export function storeSession(session: QuorumSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem(SESSION_KEY);
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
