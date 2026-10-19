import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  REGISTRATION_NOT_ALLOWED,
  authenticate,
  registerUser,
  resetPasswordByOperator,
} from "@/features/auth/server/service";
import { ForbiddenError } from "@/server/errors";

import { TEST_PASSWORD, registerTestUser } from "../helpers/auth";
import { prisma, resetDatabase } from "../helpers/db";

const OWNER = "owner@example.test";

// Allowlist mode with one email; everything else about the environment is real.
vi.mock("@/server/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/env")>();
  return {
    ...actual,
    registrationAllowed: (email: string) => email === OWNER || email.startsWith("person"),
  };
});

beforeEach(async () => {
  await resetDatabase();
});

describe("registration allowlist", () => {
  it("lets the listed email register", async () => {
    const user = await registerUser({ email: OWNER, password: TEST_PASSWORD });
    expect(user.email).toBe(OWNER);
  });

  it("refuses any other email before creating anything", async () => {
    const attempt = registerUser({ email: "stranger@example.test", password: TEST_PASSWORD });
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(REGISTRATION_NOT_ALLOWED);
    expect(await prisma.user.count()).toBe(0);
  });

  it("never affects existing accounts signing in", async () => {
    const user = await registerTestUser();
    expect(await authenticate(user.email, TEST_PASSWORD)).toMatchObject({ id: user.id });
  });
});

describe("owner-run password reset", () => {
  it("sets a working temporary password and signs the user out everywhere", async () => {
    const user = await registerTestUser();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    const temporary = await resetPasswordByOperator(` ${user.email.toUpperCase()} `);
    expect(temporary).toMatch(/^[A-Za-z0-9_-]{16}$/);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await authenticate(user.email, TEST_PASSWORD)).toBeNull();
    expect(await authenticate(user.email, temporary!)).toMatchObject({ id: user.id });
  });

  it("returns null and changes nothing for an unknown email", async () => {
    expect(await resetPasswordByOperator("nobody@example.test")).toBeNull();
  });
});
