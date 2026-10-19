import { describe, expect, it } from "vitest";

import { parseEnv, registrationAllowed } from "@/server/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  NODE_ENV: "test",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.ENABLE_DESIGN_SYSTEM_PAGE).toBe(false);
  });

  it("parses boolean flags", () => {
    expect(
      parseEnv({ ...valid, ENABLE_DESIGN_SYSTEM_PAGE: "true" }).ENABLE_DESIGN_SYSTEM_PAGE,
    ).toBe(true);
    expect(parseEnv({ ...valid, ENABLE_DESIGN_SYSTEM_PAGE: "0" }).ENABLE_DESIGN_SYSTEM_PAGE).toBe(
      false,
    );
    expect(() => parseEnv({ ...valid, ENABLE_DESIGN_SYSTEM_PAGE: "yes" })).toThrow(
      /ENABLE_DESIGN_SYSTEM_PAGE/,
    );
  });

  it("rejects a missing or non-PostgreSQL DATABASE_URL", () => {
    expect(() => parseEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://u:p@localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("never echoes values in the error message", () => {
    const secret = "postgresql-but-not-a-url-with-s3cr3t";
    expect(() => parseEnv({ ...valid, DATABASE_URL: secret })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("s3cr3t") }),
    );
  });
});

describe("build time (next build on a build server)", () => {
  const build = { NODE_ENV: "production", NEXT_PHASE: "phase-production-build" };

  it("accepts missing runtime secrets with inert placeholders", () => {
    const env = parseEnv(build);
    expect(env.DATABASE_URL).toContain("build-placeholder");
    expect(env.AUTH_SECRET).toContain("placeholder");
  });

  it("keeps real values when they are given, and still validates them", () => {
    expect(parseEnv({ ...build, ...valid, NODE_ENV: "production" }).DATABASE_URL).toBe(
      valid.DATABASE_URL,
    );
    expect(() => parseEnv({ ...build, DATABASE_URL: "mysql://u:p@h/db" })).toThrow(/DATABASE_URL/);
  });

  it("never applies placeholders outside the build", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET/);
    expect(() =>
      parseEnv({ NODE_ENV: "production", NEXT_PHASE: "phase-production-server" }),
    ).toThrow(/DATABASE_URL/);
  });
});

describe("auth and mail configuration", () => {
  it("requires a long AUTH_SECRET", () => {
    expect(() => parseEnv({ ...valid, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("refuses the console mail transport in production", () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: "production",
        MAIL_TRANSPORT: "console",
        APP_URL: "https://x.test",
      }),
    ).toThrow(/MAIL_TRANSPORT/);
  });

  it("requires APP_URL when mail is enabled", () => {
    expect(() => parseEnv({ ...valid, MAIL_TRANSPORT: "console" })).toThrow(/APP_URL/);
    expect(
      parseEnv({ ...valid, MAIL_TRANSPORT: "console", APP_URL: "http://localhost:3000" })
        .MAIL_TRANSPORT,
    ).toBe("console");
  });

  it("defaults to no mail transport (password recovery disabled)", () => {
    expect(parseEnv(valid).MAIL_TRANSPORT).toBe("none");
  });
});

describe("registration mode", () => {
  it("defaults to open", () => {
    const env = parseEnv(valid);
    expect(env.REGISTRATION_MODE).toBe("open");
    expect(registrationAllowed("anyone@example.com", env)).toBe(true);
  });

  it("allowlist admits only the listed emails, case-insensitively", () => {
    const env = parseEnv({
      ...valid,
      REGISTRATION_MODE: "allowlist",
      REGISTRATION_ALLOWLIST: " Owner@Example.com , second@example.com ",
    });
    expect(env.REGISTRATION_ALLOWLIST).toEqual(["owner@example.com", "second@example.com"]);
    expect(registrationAllowed("owner@example.com", env)).toBe(true);
    expect(registrationAllowed("OWNER@example.com", env)).toBe(true);
    expect(registrationAllowed("stranger@example.com", env)).toBe(false);
  });

  it("requires at least one email in allowlist mode", () => {
    expect(() => parseEnv({ ...valid, REGISTRATION_MODE: "allowlist" })).toThrow(
      /REGISTRATION_ALLOWLIST/,
    );
    expect(() =>
      parseEnv({ ...valid, REGISTRATION_MODE: "allowlist", REGISTRATION_ALLOWLIST: " , " }),
    ).toThrow(/REGISTRATION_ALLOWLIST/);
  });

  it("closed admits nobody and rejects unknown modes", () => {
    const env = parseEnv({ ...valid, REGISTRATION_MODE: "closed" });
    expect(registrationAllowed("owner@example.com", env)).toBe(false);
    expect(() => parseEnv({ ...valid, REGISTRATION_MODE: "invite" })).toThrow(
      /REGISTRATION_MODE/,
    );
  });
});
