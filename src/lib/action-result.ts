/**
 * Result of every server action — shared by the server (which produces it,
 * see src/server/action-result.ts) and client forms (which render it).
 */
export type ActionErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ActionErrorCode; fieldErrors?: Record<string, string> };

export const CONNECTION_ERROR =
  "We couldn't reach the server. Check your connection and try again — nothing you typed was lost.";

/**
 * Call a server action from the browser. A dropped connection or a server
 * that is restarting makes the call throw instead of returning a result; this
 * turns that into an ordinary error result, so the form shows a message and
 * its button becomes usable again. Retrying is safe: creates carry a one-time
 * request id, so a request that did reach the server is not recorded twice.
 */
export async function callAction<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: CONNECTION_ERROR, code: "INTERNAL" };
  }
}
