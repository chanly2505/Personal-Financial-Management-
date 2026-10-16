import "server-only";
import type { z } from "zod";

import { type ActionResult, ok, toActionError } from "@/server/action-result";

import { type CurrentUser, requireUser } from "./session";

/**
 * Protected server action: authentication is checked first (so anonymous
 * callers learn nothing, not even validation messages), then input is
 * validated, then the handler runs with the verified user.
 *
 *   export async function updateProfileAction(input: ProfileInput) {
 *     return updateProfile(input);
 *   }
 *   const updateProfile = authedAction(profileSchema, (input, user) => ...);
 */
export function authedAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>, user: CurrentUser) => Promise<T>,
): (raw: z.input<S>) => Promise<ActionResult<T>> {
  return async (raw) => {
    let user: CurrentUser;
    try {
      user = await requireUser();
    } catch (error) {
      return toActionError(error);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return toActionError(parsed.error);
    try {
      return ok(await handler(parsed.data, user));
    } catch (error) {
      return toActionError(error);
    }
  };
}
