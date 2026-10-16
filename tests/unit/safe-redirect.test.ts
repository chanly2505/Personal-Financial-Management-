import { describe, expect, it } from "vitest";

import { DEFAULT_AFTER_SIGN_IN, safeCallbackPath } from "@/lib/safe-redirect";

describe("safeCallbackPath", () => {
  it.each(["/accounts", "/accounts/123?tab=history", "/reports#top"])("allows %s", (path) => {
    expect(safeCallbackPath(path)).toBe(path);
  });

  it.each([
    undefined,
    "",
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/\u0009/evil.example",
    "/api/me",
    "/",
    "/sign-in",
    "accounts",
    `/${"a".repeat(600)}`,
  ])("falls back for %j", (value) => {
    expect(safeCallbackPath(value)).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
