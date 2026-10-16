import "server-only";

import { type CurrentUser, getCurrentUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { describeError, logger } from "@/server/logger";

/**
 * Consistent JSON responses for route handlers. Every error body has the same
 * shape — `{ error: { code, message } }` — and never includes internal detail.
 */
type ErrorCode = DomainError["code"] | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

const NO_STORE = { "Cache-Control": "no-store" };

export function errorResponse(code: ErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status: STATUS[code], headers: NO_STORE });
}

export const unauthorizedResponse = () =>
  errorResponse("UNAUTHORIZED", "Please sign in to continue.");

export const forbiddenResponse = () =>
  errorResponse("FORBIDDEN", "You don't have permission to do that.");

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

/**
 * Wrap a route handler so it only runs for a verified user. Unauthenticated
 * requests get 401; DomainErrors map to their status; anything else is logged
 * and returned as a generic 500.
 */
export function withUser<C>(
  handler: (request: Request, context: C, user: CurrentUser) => Promise<Response>,
) {
  return async (request: Request, context: C): Promise<Response> => {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();
    try {
      return await handler(request, context, user);
    } catch (error) {
      if (error instanceof DomainError) return errorResponse(error.code, error.message);
      logger.error("route.failed", describeError(error));
      return errorResponse("INTERNAL", "Something went wrong. Please try again.");
    }
  };
}
