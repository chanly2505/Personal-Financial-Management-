import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/accounts/server/service", () => ({}));
vi.mock("@/features/transactions/server/service", () => ({}));
vi.mock("@/features/dashboard/server/repository", () => ({}));

const { percent, savingsRate } = await import("@/features/dashboard/server/service");

describe("savings rate", () => {
  it("is (income − expenses) / income × 100 with one decimal", () => {
    expect(savingsRate(205000n, 57000n)).toBe(72.2);
    expect(savingsRate(100n, 0n)).toBe(100);
    expect(savingsRate(100n, 100n)).toBe(0);
    expect(savingsRate(5000n, 5750n)).toBe(-15);
  });

  it("is undefined (null) without income — never a division error", () => {
    expect(savingsRate(0n, 0n)).toBeNull();
    expect(savingsRate(0n, 20000n)).toBeNull();
  });

  it("rounds half away from zero exactly, even for huge amounts", () => {
    expect(percent(1n, 8n)).toBe(12.5);
    expect(percent(1n, 3n)).toBe(33.3);
    expect(percent(2n, 3n)).toBe(66.7);
    expect(percent(-2n, 3n)).toBe(-66.7);
    expect(percent(1n, 0n)).toBe(0);
    expect(percent(333_333_333_333_333n, 999_999_999_999_999n)).toBe(33.3);
  });
});
