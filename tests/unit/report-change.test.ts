import { describe, expect, it } from "vitest";

import { changePercent } from "@/features/reports/format";

describe("changePercent (Compare periods)", () => {
  it("names no change and new amounts", () => {
    expect(changePercent(500n, 500n)).toBe("No change");
    expect(changePercent(500n, 0n)).toBe("New");
  });

  it("rounds to one decimal, half away from zero", () => {
    expect(changePercent(11250n, 10000n)).toBe("+12.5%");
    expect(changePercent(9700n, 10000n)).toBe("−3.0%");
    expect(changePercent(10005n, 10000n)).toBe("+0.1%");
    expect(changePercent(9995n, 10000n)).toBe("−0.1%");
  });

  it("takes the sign from the amounts, so a tiny change keeps its direction (FIN-2)", () => {
    expect(changePercent(10001n, 10000n)).toBe("+0.0%");
    expect(changePercent(9999n, 10000n)).toBe("−0.0%");
  });

  it("measures against the size of a negative previous amount", () => {
    expect(changePercent(-50n, -100n)).toBe("+50.0%");
    expect(changePercent(-150n, -100n)).toBe("−50.0%");
  });
});
