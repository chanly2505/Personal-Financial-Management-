import { toast } from "sonner";

/**
 * Show an error the user may need to read and act on. Unlike success toasts,
 * it stays until dismissed, so a long message can be read at any pace.
 * Accepts undefined so it can follow a call that only returns a message on failure.
 */
export function showError(message: string | undefined) {
  if (message) toast.error(message, { duration: Infinity });
}
