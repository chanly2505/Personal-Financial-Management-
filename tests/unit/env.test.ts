import { describe, expect, it } from "vitest";

import { parseEnv } from "@/server/env";

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
