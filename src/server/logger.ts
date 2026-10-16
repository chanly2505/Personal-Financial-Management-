import "server-only";

/**
 * Minimal structured logger (JSON lines to stdout/stderr).
 *
 * Privacy rule (docs/SECURITY.md §9): never pass amounts, descriptions,
 * account/category names, emails, passwords, tokens, cookies or request bodies.
 * Log event names, ids, durations and error classes only.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: Level, event: string, fields: Fields = {}) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Error class and a short, non-sensitive message — never the stack or causes in production. */
export function describeError(error: unknown): Fields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      ...(process.env.NODE_ENV !== "production" && { errorMessage: error.message }),
    };
  }
  return { errorName: typeof error };
}

export const logger = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
