/**
 * Where to send the user after signing in. Only same-origin, in-app paths are
 * allowed — anything else (absolute URLs, protocol-relative "//evil.com",
 * backslash tricks, API routes) falls back to the dashboard. Prevents open
 * redirects through the `callbackUrl` parameter.
 */
export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

export function safeCallbackPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  // Reject control characters that browsers may strip to form "//".
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_AFTER_SIGN_IN;
  const path = value.split(/[?#]/)[0] ?? "";
  if (path === "/" || path.startsWith("/api") || AUTH_PATHS.some((p) => path === p)) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return value;
}

/** Public authentication pages. */
export const AUTH_PATHS = ["/sign-in", "/register", "/forgot-password", "/reset-password"];
