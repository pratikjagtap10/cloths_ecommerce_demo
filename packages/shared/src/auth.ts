// JWT helpers shared by both services.
// core-service SIGNS tokens; shop-service only VERIFIES them with the same JWT_SECRET,
// so it never needs to call core-service to know who the user is.
//
// Claims (same as the Python edition): user_id (string), token_type ("access"|"refresh"),
// email, first_name, exp, iat, jti.
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "./errors";

export type TokenType = "access" | "refresh";

export interface AuthUser {
  id: number;
  email: string;
  first_name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth() */
      user?: AuthUser;
    }
  }
}

export interface TokenSettings {
  secret: string;
  accessMinutes: number;
  refreshDays: number;
}

export interface TokenClaims extends jwt.JwtPayload {
  user_id: string;
  token_type: TokenType;
  email: string;
  first_name: string;
}

export const AUTH_MESSAGES = {
  missing: "Please log in to continue.",
  expired: "Session expired. Please log in again.",
  invalid: "Invalid session. Please log in again.",
} as const;

export function signToken(
  type: TokenType,
  user: { id: number; email: string; firstName: string },
  settings: TokenSettings,
): string {
  const expiresIn = type === "access" ? settings.accessMinutes * 60 : settings.refreshDays * 24 * 60 * 60;
  return jwt.sign(
    { user_id: String(user.id), token_type: type, email: user.email, first_name: user.firstName, jti: randomUUID() },
    settings.secret,
    { algorithm: "HS256", expiresIn },
  );
}

export class TokenError extends Error {
  constructor(public readonly reason: "expired" | "invalid") {
    super(`token ${reason}`);
  }
}

/** Verify signature, expiry and token_type. Throws TokenError. */
export function verifyToken(token: string, secret: string, expected: TokenType): TokenClaims {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch (e) {
    throw new TokenError(e instanceof jwt.TokenExpiredError ? "expired" : "invalid");
  }
  if (typeof payload !== "object" || payload.token_type !== expected || !payload.user_id) {
    throw new TokenError("invalid");
  }
  return payload as TokenClaims;
}

/** Middleware: "Authorization: Bearer <access token>" -> req.user, otherwise 401. */
export function requireAuth(secret: string): RequestHandler {
  return (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      next(new ApiError(401, AUTH_MESSAGES.missing));
      return;
    }
    try {
      const claims = verifyToken(token, secret, "access");
      req.user = { id: Number(claims.user_id), email: claims.email, first_name: claims.first_name };
      next();
    } catch (e) {
      next(new ApiError(401, e instanceof TokenError && e.reason === "expired" ? AUTH_MESSAGES.expired : AUTH_MESSAGES.invalid));
    }
  };
}

/** Use inside a route that is behind requireAuth() */
export function currentUser(req: Express.Request): AuthUser {
  if (!req.user) throw new ApiError(401, AUTH_MESSAGES.missing);
  return req.user;
}
