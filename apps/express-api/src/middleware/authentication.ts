import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AccessTokenClaims } from "../auth/jwt.js";

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

export function requireAuthentication(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction
): void {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "A valid access token is required" }
    });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    response.status(401).json({
      error: { code: "AUTHENTICATION_REQUIRED", message: "A valid access token is required" }
    });
    return;
  }

  try {
    request.auth = verifyAccessToken(token);
    next();
  } catch {
    response.status(401).json({
      error: { code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired" }
    });
  }
}

export function requireAdministrator(
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction
): void {
  if (request.auth?.role !== "administrator") {
    response.status(403).json({
      error: { code: "ADMINISTRATOR_ACCESS_REQUIRED", message: "Administrator access is required" }
    });
    return;
  }
  next();
}
