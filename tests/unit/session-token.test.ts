import { decode, encode } from "next-auth/jwt";
import { describe, expect, it } from "vitest";

/**
 * Auth.js session cookies are encrypted JWTs (JWE). These tests pin the
 * properties the app relies on: tampering and wrong secrets are rejected, and
 * expired tokens are not accepted (Auth.js allows 15 s of clock skew).
 */
const secret = "unit-test-secret-unit-test-secret-1234";
const salt = "authjs.session-token";
const claims = { sub: "0190e0a0-0000-7000-8000-000000000000", sv: 0 };

describe("session token", () => {
  it("round-trips and is not readable without the secret", async () => {
    const token = await encode({ token: claims, secret, salt, maxAge: 60 });
    expect(token.split(".")).toHaveLength(5); // JWE compact form: encrypted, not just signed
    expect(token).not.toContain(claims.sub);
    expect(await decode({ token, secret, salt })).toMatchObject(claims);
  });

  it("rejects a token made with a different secret", async () => {
    const token = await encode({
      token: claims,
      secret: "another-secret-another-secret-1234",
      salt,
    });
    await expect(decode({ token, secret, salt })).rejects.toThrow();
  });

  it("rejects a tampered token", async () => {
    const token = await encode({ token: claims, secret, salt });
    const parts = token.split(".");
    parts[3] = `${parts[3]?.slice(0, -2)}AA`;
    await expect(decode({ token: parts.join("."), secret, salt })).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await encode({ token: claims, secret, salt, maxAge: -60 });
    await expect(decode({ token, secret, salt })).rejects.toThrow(/exp/i);
  });
});
