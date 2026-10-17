import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once at startup. Import `env` instead of
 * reading `process.env` directly so a misconfiguration fails fast and loudly.
 * Never import this module from client components.
 */
const booleanFlag = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((value) => value === "true" || value === "1");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Encrypts session cookies (Auth.js). 32+ characters of randomness. */
    AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
    /**
     * Header that carries the real client IP on the hosting platform (e.g.
     * "x-real-ip"). Unset = IP-based rate limits are disabled (email-based
     * limits still apply), because untrusted headers can be spoofed.
     */
    TRUSTED_IP_HEADER: optionalString,
    /**
     * How password-reset emails are delivered. "none" disables password
     * recovery. "console" prints the link to the server log — development only.
     * A real provider is added when one is chosen (docs/PRD.md Q-12).
     */
    MAIL_TRANSPORT: z.enum(["none", "console"]).default("none"),
    /** Public base URL used to build links in emails. Required when mail is enabled. */
    APP_URL: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * Exposes /design-system in production builds (always available in development).
     * Used by the e2e suite; leave unset in deployed environments.
     */
    ENABLE_DESIGN_SYSTEM_PAGE: booleanFlag,
    /**
     * Shared secret for POST/GET /api/cron/recurring (sent as
     * "Authorization: Bearer <secret>" by the hosting platform's cron).
     * Unset = the endpoint is disabled. 32+ random characters.
     */
    CRON_SECRET: z
      .string()
      .min(32, "must be at least 32 characters (openssl rand -base64 32)")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    /**
     * "in-process" runs recurring rules hourly inside the app server (for a
     * single self-hosted server, e.g. a Mac). "off" (default) relies on an
     * external scheduler calling the cron endpoint or `npm run recurring:run`.
     */
    RECURRING_SCHEDULER: z.enum(["off", "in-process"]).default("off"),
    /**
     * Sign-ups per hour, shared by everyone, when the client IP is unknown
     * (TRUSTED_IP_HEADER unset). The end-to-end suite raises it; leave the
     * default elsewhere.
     */
    REGISTRATION_LIMIT_WITHOUT_IP: z.coerce.number().int().min(1).max(1_000_000).default(30),
  })
  .superRefine((value, ctx) => {
    if (value.MAIL_TRANSPORT === "console" && value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message: '"console" prints reset links to logs and is not allowed in production',
      });
    }
    if (value.MAIL_TRANSPORT !== "none" && !value.APP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "is required when MAIL_TRANSPORT is enabled",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // Name the variables, never print their values (they may be secrets).
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }
  return result.data;
}

export const env = parseEnv(process.env);

/** True when users can recover a forgotten password. */
export const passwordRecoveryEnabled = env.MAIL_TRANSPORT !== "none";
