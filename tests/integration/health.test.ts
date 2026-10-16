import { describe, expect, it } from "vitest";

import { isDatabaseReachable } from "@/server/health";

describe("database health", () => {
  it("reports the test database as reachable", async () => {
    expect(await isDatabaseReachable()).toBe(true);
  });
});
