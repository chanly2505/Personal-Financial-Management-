import { describe, expect, it } from "vitest";

import { getClientIp } from "@/server/auth/client-ip";

const headers = (init: Record<string, string>) => new Headers(init);

describe("getClientIp", () => {
  it("ignores client-supplied headers when no trusted header is configured", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "1.2.3.4" }), undefined)).toBeUndefined();
  });

  it("reads only the configured header", () => {
    const h = headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "6.6.6.6" });
    expect(getClientIp(h, "x-real-ip")).toBe("203.0.113.5");
  });

  it("takes the first address of a list and supports IPv6", () => {
    expect(
      getClientIp(headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }), "x-forwarded-for"),
    ).toBe("203.0.113.5");
    expect(getClientIp(headers({ "x-real-ip": "2001:db8::1" }), "x-real-ip")).toBe("2001:db8::1");
  });

  it("rejects malformed values", () => {
    expect(getClientIp(headers({ "x-real-ip": "<script>" }), "x-real-ip")).toBeUndefined();
    expect(getClientIp(headers({}), "x-real-ip")).toBeUndefined();
  });
});
