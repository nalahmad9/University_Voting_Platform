import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import type {
  ApiSuccess,
  AuthenticatedAdministrator,
  AuthenticatedStudent,
  LoginResult
} from "@quorum/shared";
import { issueAdministratorAccessToken, issueStudentAccessToken } from "../auth/jwt.js";
import {
  requireAuthentication,
  type AuthenticatedRequest
} from "../middleware/authentication.js";
import { env } from "../config/env.js";
import { getPrismaClient } from "../lib/prisma.js";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256)
});

const router = Router();
let developmentAdminPasswordHash: Promise<string> | undefined;

function administratorResponse(): AuthenticatedAdministrator {
  return {
    id: "development-admin",
    fullName: env.DEV_ADMIN_NAME,
    email: env.DEV_ADMIN_EMAIL ?? "",
    role: "administrator"
  };
}

function getDevelopmentAdminPasswordHash(): Promise<string> | null {
  if (!env.DEV_ADMIN_PASSWORD) return null;
  developmentAdminPasswordHash ??= argon2.hash(env.DEV_ADMIN_PASSWORD, { type: argon2.argon2id });
  return developmentAdminPasswordHash;
}

function studentResponse(student: {
  id: string;
  universityId: string;
  fullName: string;
  email: string;
  department: string;
  classYear: number;
  clubMemberships: string[];
}): AuthenticatedStudent {
  return {
    id: student.id,
    universityId: student.universityId,
    fullName: student.fullName,
    email: student.email,
    department: student.department,
    classYear: student.classYear,
    clubMemberships: student.clubMemberships,
    role: "student"
  };
}

router.post("/login", async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a university ID or email and password",
        details: parsed.error.flatten().fieldErrors
      }
    });
    return;
  }

  const { identifier, password } = parsed.data;
  const isAdministratorIdentifier = Boolean(
    env.DEV_ADMIN_EMAIL && identifier.toLowerCase() === env.DEV_ADMIN_EMAIL.toLowerCase()
  );

  if (isAdministratorIdentifier) {
    const passwordHash = getDevelopmentAdminPasswordHash();
    const passwordMatches = passwordHash
      ? await argon2.verify(await passwordHash, password)
      : false;

    if (!passwordMatches) {
      response.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email/university ID or password" }
      });
      return;
    }

    const user = administratorResponse();
    const data: LoginResult = {
      accessToken: issueAdministratorAccessToken(user.email),
      tokenType: "Bearer",
      expiresIn: env.JWT_EXPIRES_IN,
      user
    };
    const result: ApiSuccess<LoginResult> = { data };
    response.json(result);
    return;
  }

  const prisma = getPrismaClient();
  const student = await prisma.student.findFirst({
    where: identifier.includes("@")
      ? { email: { equals: identifier, mode: "insensitive" } }
      : { universityId: { equals: identifier, mode: "insensitive" } }
  });

  const passwordMatches = student
    ? await argon2.verify(student.passwordHash, password)
    : false;

  if (!student || !passwordMatches) {
    response.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email/university ID or password" }
    });
    return;
  }

  const user = studentResponse(student);
  const data: LoginResult = {
    accessToken: issueStudentAccessToken({
      studentId: student.id,
      universityId: student.universityId
    }),
    tokenType: "Bearer",
    expiresIn: env.JWT_EXPIRES_IN,
    user
  };

  const result: ApiSuccess<LoginResult> = { data };
  response.json(result);
});

router.get("/me", requireAuthentication, async (request: AuthenticatedRequest, response) => {
  if (request.auth?.role !== "student") {
    response.status(403).json({
      error: { code: "STUDENT_ACCESS_REQUIRED", message: "Student access is required" }
    });
    return;
  }
  const studentId = request.auth?.sub;
  if (!studentId) {
    response.status(401).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "A valid access token is required" }
    });
    return;
  }

  const student = await getPrismaClient().student.findUnique({ where: { id: studentId } });
  if (!student) {
    response.status(401).json({
      error: { code: "ACCOUNT_NOT_FOUND", message: "The account for this token is unavailable" }
    });
    return;
  }

  const result: ApiSuccess<AuthenticatedStudent> = { data: studentResponse(student) };
  response.json(result);
});

router.get("/admin/me", requireAuthentication, (request: AuthenticatedRequest, response) => {
  if (request.auth?.role !== "administrator") {
    response.status(403).json({
      error: { code: "ADMINISTRATOR_ACCESS_REQUIRED", message: "Administrator access is required" }
    });
    return;
  }

  const result: ApiSuccess<AuthenticatedAdministrator> = { data: administratorResponse() };
  response.json(result);
});

router.post("/logout", requireAuthentication, (_request, response) => {
  // Access tokens are stateless. The client completes logout by deleting its token.
  response.status(204).send();
});

export const authRouter = router;
