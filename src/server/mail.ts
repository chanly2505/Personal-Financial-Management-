import "server-only";

import { env } from "@/server/env";

/**
 * Outgoing email. Only the password-reset message exists today.
 *
 * Transports (MAIL_TRANSPORT):
 *   none     — nothing is sent; password recovery is hidden in the UI.
 *   console  — development only: prints the message to the server console so
 *              the flow can be exercised locally. Refused in production by env.ts.
 * A real provider (SMTP or API) plugs in here once chosen (docs/PRD.md Q-12).
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

const consoleMailer: Mailer = {
  async send(message) {
    // Deliberately bypasses the privacy-safe logger: this transport exists only
    // so developers can read the message locally.
    console.info(
      `\n--- Development email (not sent) ---\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n------------------------------------\n`,
    );
  },
};

const disabledMailer: Mailer = {
  async send() {
    throw new Error("Email delivery is not configured (MAIL_TRANSPORT=none)");
  },
};

let override: Mailer | undefined;

export function getMailer(): Mailer {
  if (override) return override;
  return env.MAIL_TRANSPORT === "console" ? consoleMailer : disabledMailer;
}

/** Tests only: capture messages instead of printing them. */
export function setMailerForTesting(mailer: Mailer | undefined) {
  override = mailer;
}

export function appUrl(path: string): string {
  if (!env.APP_URL) throw new Error("APP_URL is not configured");
  return new URL(path, env.APP_URL).toString();
}
