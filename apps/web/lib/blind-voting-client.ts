import { RSABSSA } from "@cloudflare/blindrsa-ts";
import type {
  ApiError,
  ApiSuccess,
  BlindTokenIssuanceResult,
  CastVoteResult,
  RequestBlindTokenInput,
  VotingKeyRecord
} from "@quorum/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const suite = RSABSSA.SHA384.PSS.Deterministic();

type PendingBlindVote = {
  ballotId: string;
  token: string;
  inverse: string;
  blindedToken: string;
  idempotencyKey: string;
  keyVersion: string;
  expiresAt: string;
  publicKey: JsonWebKey;
  signature?: string;
};

export class VotingApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number) {
    super(message);
    this.name = "VotingApiError";
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function voteTokenMessage(input: Pick<PendingBlindVote, "ballotId" | "keyVersion" | "expiresAt" | "token">): Uint8Array {
  return new TextEncoder().encode([
    "quorum.vote-token.v1",
    input.ballotId,
    input.keyVersion,
    input.expiresAt,
    input.token
  ].join("\u0000"));
}

function pendingStorageKey(ballotId: string): string {
  return `quorum-pending-blind-vote:${ballotId}`;
}

function readPending(ballotId: string): PendingBlindVote | null {
  try {
    const value = sessionStorage.getItem(pendingStorageKey(ballotId));
    if (!value) return null;
    const pending = JSON.parse(value) as PendingBlindVote;
    if (pending.ballotId !== ballotId || new Date(pending.expiresAt) <= new Date()) {
      sessionStorage.removeItem(pendingStorageKey(ballotId));
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

function savePending(pending: PendingBlindVote): void {
  sessionStorage.setItem(pendingStorageKey(pending.ballotId), JSON.stringify(pending));
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new VotingApiError(
      body?.error.message ?? "The vote could not be completed",
      body?.error.code ?? "VOTING_REQUEST_FAILED",
      response.status
    );
  }
  return (await response.json()) as T;
}

async function loadVotingKey(ballotId: string): Promise<VotingKeyRecord> {
  const response = await fetch(`${API_BASE_URL}/voting/ballots/${encodeURIComponent(ballotId)}/key`, {
    headers: { accept: "application/json" },
    credentials: "omit",
    cache: "no-store"
  });
  return (await parseResponse<ApiSuccess<VotingKeyRecord>>(response)).data;
}

async function createPending(ballotId: string): Promise<PendingBlindVote> {
  const key = await loadVotingKey(ballotId);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key.publicKey,
    { name: "RSA-PSS", hash: "SHA-384" },
    true,
    ["verify"]
  );
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = encodeBase64Url(tokenBytes);
  const message = suite.prepare(voteTokenMessage({
    ballotId,
    keyVersion: key.keyVersion,
    expiresAt: key.expiresAt,
    token
  }));
  const { blindedMsg, inv } = await suite.blind(publicKey, message);
  const pending: PendingBlindVote = {
    ballotId,
    token,
    inverse: encodeBase64Url(inv),
    blindedToken: encodeBase64Url(blindedMsg),
    idempotencyKey: crypto.randomUUID(),
    keyVersion: key.keyVersion,
    expiresAt: key.expiresAt,
    publicKey: key.publicKey
  };
  savePending(pending);
  return pending;
}

async function issueAndFinalize(
  pending: PendingBlindVote,
  accessToken: string,
  livenessProof: string
): Promise<PendingBlindVote> {
  if (pending.signature) return pending;
  const requestBody: RequestBlindTokenInput = {
    ballotId: pending.ballotId,
    blindedToken: pending.blindedToken,
    keyVersion: pending.keyVersion,
    idempotencyKey: pending.idempotencyKey,
    livenessProof
  };
  const response = await fetch(`${API_BASE_URL}/request-token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
    },
    credentials: "omit",
    body: JSON.stringify(requestBody)
  });
  const issuance = (await parseResponse<ApiSuccess<BlindTokenIssuanceResult>>(response)).data;
  if (issuance.keyVersion !== pending.keyVersion || issuance.expiresAt !== pending.expiresAt) {
    throw new VotingApiError("The voting key changed. Restart the ballot.", "VOTING_KEY_CHANGED", 409);
  }
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    pending.publicKey,
    { name: "RSA-PSS", hash: "SHA-384" },
    true,
    ["verify"]
  );
  const preparedMessage = suite.prepare(voteTokenMessage(pending));
  const signature = await suite.finalize(
    publicKey,
    preparedMessage,
    decodeBase64Url(issuance.blindSignature),
    decodeBase64Url(pending.inverse)
  );
  const finalized = { ...pending, signature: encodeBase64Url(signature) };
  savePending(finalized);
  return finalized;
}

function deviceClass(): "desktop" | "mobile" | "tablet" | "unknown" {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export async function castBlindVote(input: {
  ballotId: string;
  candidateId: string;
  accessToken: string;
  livenessProof: string;
  startedAt: number;
}): Promise<CastVoteResult> {
  let pending = readPending(input.ballotId) ?? await createPending(input.ballotId);
  pending = await issueAndFinalize(pending, input.accessToken, input.livenessProof);
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - input.startedAt) / 1000));
  const response = await fetch(`${API_BASE_URL}/cast-vote`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    credentials: "omit",
    body: JSON.stringify({
      ballotId: input.ballotId,
      candidateId: input.candidateId,
      token: pending.token,
      signature: pending.signature,
      keyVersion: pending.keyVersion,
      expiresAt: pending.expiresAt,
      timeTakenSeconds: Math.min(3600, elapsedSeconds),
      riskFeatures: {
        deviceClass: deviceClass(),
        completionDurationBand: elapsedSeconds < 20 ? "under_20_seconds" : elapsedSeconds <= 60 ? "20_to_60_seconds" : "over_60_seconds",
        replayIndicator: false
      }
    })
  });
  const result = (await parseResponse<ApiSuccess<CastVoteResult>>(response)).data;
  sessionStorage.removeItem(pendingStorageKey(input.ballotId));
  return result;
}
