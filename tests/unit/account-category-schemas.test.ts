import { describe, expect, it } from "vitest";

import { createAccountSchema, updateAccountSchema } from "@/features/accounts/schemas";
import { createCategorySchema, updateCategorySchema } from "@/features/categories/schemas";

const id = "0190e0a0-0000-7000-8000-000000000000";

describe("account schemas", () => {
  it("trims names and turns an empty opening balance into zero", () => {
    expect(
      createAccountSchema.parse({
        name: "  ABA  ",
        type: "BANK",
        currency: "USD",
        openingBalance: " ",
      }),
    ).toEqual({ name: "ABA", type: "BANK", currency: "USD", openingBalance: "0" });
  });

  it("limits name length and requires known types and currencies", () => {
    const base = { type: "BANK", currency: "USD", openingBalance: "0" };
    expect(createAccountSchema.safeParse({ ...base, name: "x".repeat(61) }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...base, name: "ok", type: "LOAN" }).success).toBe(
      false,
    );
    expect(createAccountSchema.safeParse({ ...base, name: "ok", currency: "THB" }).success).toBe(
      false,
    );
  });

  it("has no currency field on update", () => {
    const parsed = updateAccountSchema.parse({
      id,
      name: "x",
      type: "CASH",
      openingBalance: "1",
      currency: "KHR",
    } as never);
    expect(parsed).not.toHaveProperty("currency");
  });

  it("requires a UUID id on update", () => {
    expect(
      updateAccountSchema.safeParse({ id: "1", name: "x", type: "CASH", openingBalance: "" })
        .success,
    ).toBe(false);
  });
});

describe("category schemas", () => {
  it("requires a type and a palette colour", () => {
    expect(
      createCategorySchema.safeParse({ name: "Coffee", type: "EXPENSE", color: "chart-2" }).success,
    ).toBe(true);
    expect(createCategorySchema.safeParse({ name: "Coffee", color: "chart-2" }).success).toBe(
      false,
    );
    expect(
      createCategorySchema.safeParse({ name: "Coffee", type: "TRANSFER", color: "chart-2" })
        .success,
    ).toBe(false);
    expect(
      createCategorySchema.safeParse({ name: "Coffee", type: "EXPENSE", color: "#000" }).success,
    ).toBe(false);
  });

  it("limits names to 40 characters", () => {
    expect(
      updateCategorySchema.safeParse({ id, name: "x".repeat(41), type: "INCOME", color: "chart-1" })
        .success,
    ).toBe(false);
  });
});
