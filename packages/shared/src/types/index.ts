export type UserRole = "student" | "administrator";

export type BallotPhase =
  | "draft"
  | "nomination"
  | "review"
  | "voting"
  | "tallying"
  | "published"
  | "archived"
  | "cancelled";

export type ScopeType = "global" | "department" | "class_year" | "club" | "combined";

export type NominationStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type VoteQuarantineStatus =
  | "accepted"
  | "quarantined"
  | "reinstated"
  | "rejected";

export type ReceiptVerificationStatus =
  | "recorded"
  | "quarantined"
  | "unpublished"
  | "not_found";

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiSuccess<T> {
  data: T;
}

export interface AuthenticatedStudent {
  id: string;
  universityId: string;
  fullName: string;
  email: string;
  department: string;
  classYear: number;
  clubMemberships: string[];
  role: "student";
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthenticatedStudent | AuthenticatedAdministrator;
}

export interface AuthenticatedAdministrator {
  id: "development-admin";
  fullName: string;
  email: string;
  role: "administrator";
}

export type PersistedBallotScope = "GLOBAL" | "DEPARTMENTAL" | "SENIOR" | "CLUB" | "COMBINED";

export type PersistedBallotPhase = "NOMINATIONS_OPEN" | "VOTING_OPEN" | "CLOSED";

export interface BallotRecord {
  id: string;
  title: string;
  description: string | null;
  scopeType: PersistedBallotScope;
  scopeTarget: string | null;
  startTime: string;
  endTime: string;
  createdAt: string;
  phase: PersistedBallotPhase;
  candidateCount: number;
}

export interface StudentBallotRecord extends BallotRecord {
  eligible: true;
}

export interface StudentCandidateRecord {
  id: string;
  ballotId: string;
  fullName: string;
  department: string;
  classYear: number;
  candidacyStatement: string;
  manifestoText: string;
  manifestoHighlights: [string, string, string];
  manifestoTopics: Record<string, string>;
  isCurrentStudent: boolean;
}

export type PersistedNominationStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

export interface StudentNominationRecord {
  id: string;
  ballotId: string;
  candidacyStatement: string;
  manifestoText: string;
  nominationStatus: PersistedNominationStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentNominationOpportunity {
  ballot: StudentBallotRecord;
  nomination: StudentNominationRecord | null;
  canNominate: boolean;
}

export interface CreateStudentNominationRequest {
  ballotId: string;
  candidacyStatement: string;
  manifestoText: string;
}

export interface AdminNominationRecord extends StudentNominationRecord {
  manifestoHighlights: [string, string, string];
  student: {
    id: string;
    universityId: string;
    fullName: string;
    email: string;
    department: string;
    classYear: number;
    clubMemberships: string[];
  };
  ballot: {
    id: string;
    title: string;
    phase: PersistedBallotPhase;
    startTime: string;
    endTime: string;
  };
}

export interface ReviewNominationRequest {
  decision: "APPROVE" | "REJECT";
  rejectionReason?: string;
  manifestoHighlights?: [string, string, string];
}

export interface VotingKeyRecord {
  ballotId: string;
  keyVersion: string;
  expiresAt: string;
  suite: "RSABSSA-SHA384-PSS-Deterministic";
  publicKey: JsonWebKey;
}

export interface LivenessCompletionResult {
  proof: string;
  expiresInSeconds: number;
}

export interface RequestBlindTokenInput {
  ballotId: string;
  blindedToken: string;
  keyVersion: string;
  idempotencyKey: string;
  livenessProof: string;
}

export interface BlindTokenIssuanceResult {
  blindSignature: string;
  keyVersion: string;
  expiresAt: string;
}

export interface AnonymousRiskFeatures {
  deviceClass: "desktop" | "mobile" | "tablet" | "unknown";
  completionDurationBand: "under_20_seconds" | "20_to_60_seconds" | "over_60_seconds";
  replayIndicator: boolean;
}

export interface CastVoteInput {
  ballotId: string;
  candidateId: string;
  token: string;
  signature: string;
  keyVersion: string;
  expiresAt: string;
  timeTakenSeconds: number;
  riskFeatures: AnonymousRiskFeatures;
}

export interface CastVoteResult {
  receipt: string;
  recordedAt: string;
  status: "RECORDED" | "QUARANTINED";
}

export interface CreateBallotRequest {
  title: string;
  description?: string;
  scopeType: PersistedBallotScope;
  scopeTarget?: string | null;
  startTime: string;
  endTime: string;
}
