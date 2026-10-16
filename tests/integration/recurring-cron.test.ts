import { afterEach, describe, expect, it, vi } from "vitest";

import { resetDatabase } from "../helpers/db";

/** The scheduler endpoint: disabled without CRON_SECRET, constant-time bearer check, safe output. */

const SECRET = "a-test-secret-that-is-long-enough-123456";

async function loadRoute(secret: string | undefined) {
  vi.resetModules();
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  return import("@/app/api/cron/recurring/route");
}

const call = (
  route: Awaited<ReturnType<typeof loadRoute>>,
  auth?: string,
  method: "GET" | "POST" = "GET",
) =>
  route[method](
    new Request("http://localhost/api/cron/recurring", {
      method,
      headers: auth ? { authorization: auth } : {},
    }),
  );

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("/api/cron/recurring", () => {
  it("is disabled until CRON_SECRET is configured", async () => {
    const route = await loadRoute(undefined);
    const res = await call(route, `Bearer ${SECRET}`);
    expect(res.status).toBe(503);
  });

  it("rejects missing or wrong secrets", async () => {
    const route = await loadRoute(SECRET);
    expect((await call(route)).status).toBe(401);
    expect((await call(route, "Bearer wrong")).status).toBe(401);
    expect((await call(route, `Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call(route, SECRET)).status).toBe(401);
  });

  it("runs the engine with the right secret (GET or POST) and returns only counts", async () => {
    await resetDatabase();
    const route = await loadRoute(SECRET);
    for (const method of ["GET", "POST"] as const) {
      const res = await call(route, `Bearer ${SECRET}`, method);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ rules: 0, posted: 0, failed: 0, paused: 0, busy: 0 });
    }
  });
});
