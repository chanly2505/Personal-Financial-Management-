import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  deleteAccountSchema,
  registerSchema,
  signInSchema,
} from "@/features/auth/schemas";
import { notificationsSchema, preferencesSchema, profileSchema } from "@/features/settings/schemas";

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

describe("settings schemas", () => {
  const prefs = {
    baseCurrency: "USD",
    timezone: "Asia/Phnom_Penh",
    dateFormat: "D_MMM_Y",
    numberFormat: "COMMA_DOT",
    currencyDisplay: "SYMBOL",
  };

  it("accepts a name up to 60 characters and an empty name", () => {
    expect(profileSchema.safeParse({ name: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "x".repeat(60) }).success).toBe(true);
    expect(profileSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  });

  it("strips anything that is not a profile field (e.g. email or password)", () => {
    expect(profileSchema.parse({ name: "A", email: "x@y.z", passwordHash: "h" })).toEqual({
      name: "A",
    });
  });

  it("accepts every supported display preference", () => {
    for (const dateFormat of ["D_MMM_Y", "MMM_D_Y", "DD_MM_Y", "ISO"]) {
      expect(preferencesSchema.safeParse({ ...prefs, dateFormat }).success).toBe(true);
    }
    for (const numberFormat of ["COMMA_DOT", "DOT_COMMA", "SPACE_COMMA"]) {
      expect(preferencesSchema.safeParse({ ...prefs, numberFormat }).success).toBe(true);
    }
    expect(preferencesSchema.safeParse({ ...prefs, currencyDisplay: "CODE" }).success).toBe(true);
  });

  it("rejects unknown timezones, currencies and formats", () => {
    expect(preferencesSchema.safeParse({ ...prefs, timezone: "Mars/Base" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...prefs, baseCurrency: "EUR" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...prefs, dateFormat: "YYYY" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...prefs, numberFormat: "x" }).success).toBe(false);
  });

  it.each([
    ["ALL", "80", true],
    ["LIMIT_ONLY", "100", true],
    ["OFF", "1", true],
    ["SOMETIMES", "80", false],
    ["ALL", "0", false],
    ["ALL", "101", false],
    ["ALL", "80.5", false],
  ])("notifications %s at %s%% → %s", (budgetAlertMode, defaultAlertThreshold, ok) => {
    expect(notificationsSchema.safeParse({ budgetAlertMode, defaultAlertThreshold }).success).toBe(
      ok,
    );
  });
});
