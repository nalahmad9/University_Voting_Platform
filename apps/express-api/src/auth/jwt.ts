import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";

const TOKEN_ISSUER = "quorum-api";
const TOKEN_AUDIENCE = "quorum-web";
const LIVENESS_AUDIENCE = "quorum-vote-issuance";

const accessTokenClaimsSchema = z.discriminatedUnion("role", [
  z.object({
    sub: z.string().uuid(),
    role: z.literal("student"),
    universityId: z.string().min(1),
    type: z.literal("access")
  }),
  z.object({
    sub: z.literal("development-admin"),
    role: z.literal("administrator"),
    email: z.string().email(),
    type: z.literal("access")
  })
]);

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

const livenessProofClaimsSchema = z.object({
  sub: z.string().uuid(),
  ballotId: z.string().uuid(),
  type: z.literal("liveness")
});

export type LivenessProofClaims = z.infer<typeof livenessProofClaimsSchema>;

function jwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return env.JWT_SECRET;
}

export function issueStudentAccessToken(input: {
  studentId: string;
  universityId: string;
}): string {
  return jwt.sign(
    {
      role: "student",
      universityId: input.universityId,
      type: "access"
    },
    jwtSecret(),
    {
      algorithm: "HS256",
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
      subject: input.studentId,
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
    }
  );
}

export function issueAdministratorAccessToken(email: string): string {
  return jwt.sign(
    {
      role: "administrator",
      email,
      type: "access"
    },
    jwtSecret(),
    {
      algorithm: "HS256",
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
      subject: "development-admin",
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
    }
  );
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, jwtSecret(), {
    algorithms: ["HS256"],
    audience: TOKEN_AUDIENCE,
    issuer: TOKEN_ISSUER
  });

  return accessTokenClaimsSchema.parse(payload);
}

export function issueLivenessProof(studentId: string, ballotId: string): string {
  return jwt.sign(
    { ballotId, type: "liveness" },
    jwtSecret(),
    {
      algorithm: "HS256",
      audience: LIVENESS_AUDIENCE,
      issuer: TOKEN_ISSUER,
      subject: studentId,
      expiresIn: "5m"
    }
  );
}

export function verifyLivenessProof(token: string): LivenessProofClaims {
  const payload = jwt.verify(token, jwtSecret(), {
    algorithms: ["HS256"],
    audience: LIVENESS_AUDIENCE,
    issuer: TOKEN_ISSUER
  });
  return livenessProofClaimsSchema.parse(payload);
}
