import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  deleteAccountSchema,
  registerSchema,
  signInSchema,
} from "@/features/auth/schemas";
import { profileSchema } from "@/features/settings/schemas";

describe("auth schemas", () => {
  it("normalises email to trimmed lower case", () => {
    const parsed = signInSchema.parse({ email: "  Alice@Example.COM ", password: "x" });
    expect(parsed.email).toBe("alice@example.com");
  });

  it("enforces password length 10–128 on registration only", () => {
    const base = { email: "a@example.test", confirmPassword: "" };
    expect(
      registerSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success,
    ).toBe(false);
    const ok = "ten chars!";
    expect(registerSchema.safeParse({ ...base, password: ok, confirmPassword: ok }).success).toBe(
      true,
    );
    const long = "x".repeat(129);
    expect(
      registerSchema.safeParse({ ...base, password: long, confirmPassword: long }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        ...base,
        password: " ".repeat(12),
        confirmPassword: " ".repeat(12),
      }).success,
    ).toBe(false);
    // Sign-in does not reveal the policy for existing passwords.
    expect(signInSchema.safeParse({ email: "a@example.test", password: "short" }).success).toBe(
      true,
    );
  });

  it("requires matching confirmation", () => {
    const result = registerSchema.safeParse({
      email: "a@example.test",
      password: "long enough 1",
      confirmPassword: "long enough 2",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("does not accept extra fields such as userId", () => {
    const parsed = profileSchema.parse({
      name: "A",
      baseCurrency: "USD",
      timezone: "UTC",
      exchangeRateKhrPerUsd: "4100",
      userId: "someone-else",
    } as never);
    expect(parsed).not.toHaveProperty("userId");
  });

  it("rejects reusing the current password", () => {
    const same = "same password 1";
    expect(
      changePasswordSchema.safeParse({
        currentPassword: same,
        newPassword: same,
        confirmPassword: same,
      }).success,
    ).toBe(false);
  });

  it("requires the exact DELETE confirmation", () => {
    expect(deleteAccountSchema.safeParse({ password: "x", confirmation: "delete" }).success).toBe(
      false,
    );
    expect(deleteAccountSchema.safeParse({ password: "x", confirmation: "DELETE" }).success).toBe(
      true,
    );
  });
});

describe("profile schema", () => {
  const base = {
    name: "",
    baseCurrency: "USD",
    timezone: "Asia/Phnom_Penh",
    exchangeRateKhrPerUsd: "4100",
  };

  it.each(["4100", "4100.5", "4100.1234", "0.5"])("accepts rate %s", (rate) => {
    expect(profileSchema.safeParse({ ...base, exchangeRateKhrPerUsd: rate }).success).toBe(true);
  });

  it.each(["0", "-1", "4100.12345", "1e4", "abc", "100001"])("rejects rate %s", (rate) => {
    expect(profileSchema.safeParse({ ...base, exchangeRateKhrPerUsd: rate }).success).toBe(false);
  });

  it("rejects unknown timezones and currencies", () => {
    expect(profileSchema.safeParse({ ...base, timezone: "Mars/Base" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, baseCurrency: "EUR" }).success).toBe(false);
  });
});
