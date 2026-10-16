import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ActionResult } from "./action-result";

/**
 * Apply a failed ActionResult to a React Hook Form instance: field errors go to
 * their fields (the first one receives focus), and the general message is
 * returned for a form-level alert.
 */
export function applyActionErrors<T extends FieldValues>(
  result: Extract<ActionResult<unknown>, { ok: false }>,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  let focused = false;
  for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
    if ((fields as readonly string[]).includes(key)) {
      setError(key as Path<T>, { type: "server", message }, { shouldFocus: !focused });
      focused = true;
    }
  }
  // Show the general message unless every problem was attached to a visible field.
  return focused && result.code === "VALIDATION" ? null : result.error;
}
