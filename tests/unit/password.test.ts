import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "@/server/auth/password";

/**
 * Hashes created by the previous native library (@node-rs/argon2 2.2.1, same
 * parameters) before the switch to @noble/hashes: existing users must still be
 * able to sign in.
 */
const NATIVE = [
  {
    password: "correct horse battery staple",
    hash: "$argon2id$v=19$m=19456,t=2,p=1$xcXRJUey0Py4lXSJDNkDaw$pWA5YZXYlOIFhfwW61nl4fzZJ3m2XMSvR5e8/ngjpnM",
  },
  {
    password: "pässwörd ✓ 🔒",
    hash: "$argon2id$v=19$m=19456,t=2,p=1$96dLewAuKxEXlwP9RigRuQ$jdGFyhVAG+58wYLBqgACnbs08oL/Q6NEbmy0uMJhzx0",
  },
];

describe("password hashing (argon2id, PHC format)", () => {
  it.each(NATIVE)(
    "verifies hashes made by the previous native library",
    async ({ password, hash }) => {
      expect(await verifyPassword(hash, password)).toBe(true);
      expect(await verifyPassword(hash, `${password}x`)).toBe(false);
    },
  );

  it("creates salted hashes with the OWASP parameters that verify", async () => {
    const a = await hashPassword("a long enough password");
    const b = await hashPassword("a long enough password");
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(a).not.toBe(b); // random salt
    expect(await verifyPassword(a, "a long enough password")).toBe(true);
    expect(await verifyPassword(a, "a long enough passwore")).toBe(false);
    expect(needsRehash(a)).toBe(false);
  });

  it.each([
    "",
    "not a hash",
    "$argon2i$v=19$m=19456,t=2,p=1$xcXRJUey0Py4lXSJDNkDaw$pWA5YZXYlOIFhfwW61nl4fzZJ3m2XMSvR5e8/ngjpnM",
    "$argon2id$v=19$m=999999999,t=2,p=1$xcXRJUey0Py4lXSJDNkDaw$pWA5YZXYlOIFhfwW61nl4fzZJ3m2XMSvR5e8/ngjpnM",
    "$argon2id$v=19$m=19456,t=2,p=1$***$pWA5YZXYlOIFhfwW61nl4fzZJ3m2XMSvR5e8/ngjpnM",
  ])("rejects malformed or out-of-bounds hashes without throwing: %s", async (hash) => {
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(false);
  });

  it("flags hashes with older parameters for rehashing", () => {
    expect(needsRehash("$argon2id$v=19$m=4096,t=3,p=1$abc$def")).toBe(true);
  });
});
