import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/lib/action-result";

import { DomainError, ValidationError } from "./errors";
import { describeError, logger } from "./logger";

/**
 * The only return type of server actions. Expected failures are values the UI
 * renders; nothing internal leaks to the client. The type lives in src/lib so
 * client components can import it.
 */
export type { ActionResult } from "@/lib/action-result";

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<void>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** First message per field from a Zod error, keyed by dotted path. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/** Map any thrown value to a safe ActionResult. Unexpected errors are logged, not exposed. */
export function toActionError(error: unknown, event = "action.failed"): ActionResult<never> {
  // Let Next.js control-flow errors (redirect(), notFound()) propagate.
  unstable_rethrow(error);
  if (error instanceof ValidationError) {
    return { ok: false, code: error.code, error: error.message, fieldErrors: error.fieldErrors };
  }
  if (error instanceof DomainError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: "VALIDATION",
      error: "Please check the highlighted fields.",
      fieldErrors: zodFieldErrors(error),
    };
  }
  logger.error(event, describeError(error));
  return { ok: false, code: "INTERNAL", error: GENERIC_ERROR };
}

/**
 * Wrap a server action body: validates input with `schema`, runs `handler`,
 * and converts every failure into an ActionResult.
 *
 *   export const createThing = action(createThingSchema, async (input) => { ... });
 */
export function action<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>) => Promise<T>,
): (raw: z.input<S>) => Promise<ActionResult<T>> {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return toActionError(parsed.error);
    try {
      return ok(await handler(parsed.data));
    } catch (error) {
      return toActionError(error);
    }
  };
}
