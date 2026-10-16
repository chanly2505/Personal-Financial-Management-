import "server-only";

/**
 * Expected, user-facing failures. Services throw these; server actions convert
 * them to `ActionResult` values (see action-result.ts). Messages must be safe
 * to show to the user: plain language, no internal details, no other users' data.
 */
export abstract class DomainError extends Error {
  abstract readonly code:
    "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED";

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Record does not exist — or belongs to another user (deliberately indistinguishable). */
export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;
  constructor(message = "We couldn't find that item.") {
    super(message);
  }
}

/** Input is well-formed but breaks a business rule. `fieldErrors` map to form fields. */
export class ValidationError extends DomainError {
  readonly code = "VALIDATION" as const;
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** The record changed elsewhere, or the operation clashes with existing data. */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT" as const;
}

/** No valid session. */
export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED" as const;
  constructor(message = "Please sign in to continue.") {
    super(message);
  }
}

/**
 * Signed in, but not allowed to perform this action. Not used for records owned
 * by other users — those are NotFoundError so their existence is not revealed.
 */
export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

export class RateLimitedError extends DomainError {
  readonly code = "RATE_LIMITED" as const;
  constructor(message = "Too many attempts. Please wait a few minutes and try again.") {
    super(message);
  }
}
