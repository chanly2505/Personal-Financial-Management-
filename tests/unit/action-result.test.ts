import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CONNECTION_ERROR, callAction } from "@/lib/action-result";
import { action, ok, toActionError, zodFieldErrors } from "@/server/action-result";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toActionError", () => {
  it("passes domain error messages through with their code", () => {
    expect(toActionError(new NotFoundError())).toEqual({
      ok: false,
      code: "NOT_FOUND",
      error: "We couldn't find that item.",
    });
    expect(toActionError(new ConflictError("Changed elsewhere."))).toMatchObject({
      code: "CONFLICT",
      error: "Changed elsewhere.",
    });
  });

  it("includes field errors for validation errors", () => {
    const result = toActionError(new ValidationError("Check the form.", { amount: "Too large." }));
    expect(result).toEqual({
      ok: false,
      code: "VALIDATION",
      error: "Check the form.",
      fieldErrors: { amount: "Too large." },
    });
  });

  it("hides unexpected errors behind a generic message and logs them", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = toActionError(new Error("connection refused at 10.0.0.5:5432 password=secret"));
    expect(result).toEqual({
      ok: false,
      code: "INTERNAL",
      error: "Something went wrong. Please try again.",
    });
    expect(JSON.stringify(result)).not.toContain("10.0.0.5");
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("zodFieldErrors", () => {
  it("keeps the first message per dotted path", () => {
    const schema = z.object({
      name: z.string().min(1, "Enter a name."),
      nested: z.object({ value: z.number({ error: "Enter a number." }) }),
    });
    const parsed = schema.safeParse({ name: "", nested: { value: "x" } });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(zodFieldErrors(parsed.error)).toEqual({
        name: "Enter a name.",
        "nested.value": "Enter a number.",
      });
    }
  });
});

describe("action", () => {
  const schema = z.object({ name: z.string().trim().min(1, "Enter a name.") });

  it("validates input before calling the handler", async () => {
    const handler = vi.fn(async () => "never");
    const run = action(schema, handler);
    const result = await run({ name: "   " });
    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      code: "VALIDATION",
      fieldErrors: { name: "Enter a name." },
    });
  });

  it("passes parsed (transformed) input and wraps the result", async () => {
    const run = action(schema, async ({ name }) => name.toUpperCase());
    expect(await run({ name: "  wallet " })).toEqual(ok("WALLET"));
  });

  it("converts thrown domain errors to results", async () => {
    const run = action(schema, async () => {
      throw new NotFoundError();
    });
    expect(await run({ name: "x" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("callAction", () => {
  it("passes results through unchanged", async () => {
    const ok = { ok: true as const, data: 1 };
    expect(await callAction(async () => ok)).toBe(ok);
    const failed = { ok: false as const, error: "No", code: "VALIDATION" as const };
    expect(await callAction(async () => failed)).toBe(failed);
  });

  it("turns a thrown request (dropped connection) into an error result", async () => {
    const result = await callAction<number>(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ ok: false, error: CONNECTION_ERROR, code: "INTERNAL" });
  });
});
