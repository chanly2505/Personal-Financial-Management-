import { z } from "zod";

/**
 * Input schemas for authentication and account security. Shared by client
 * forms (React Hook Form) and server actions — the server always re-validates.
 */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Enter a valid email address."));

/** For new passwords. Length only — no composition rules (NIST SP 800-63B). */
export const newPasswordSchema = z
  .string({ error: "Enter a password." })
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`)
  .refine((value) => value.trim().length > 0, "Enter a password.");

/** For existing passwords: never reveal policy details when signing in. */
const currentPasswordSchema = z
  .string({ error: "Enter your password." })
  .min(1, "Enter your password.")
  .max(PASSWORD_MAX, "Email or password is incorrect.");

const nameSchema = z
  .string()
  .trim()
  .max(60, "Use at most 60 characters.")
  .optional()
  .transform((value) => (value ? value : undefined));

export const signInSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema,
  callbackUrl: z.string().max(512).optional(),
});
export type SignInInput = z.input<typeof signInSchema>;

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .min(32, "This reset link is invalid or has expired.")
      .max(128, "This reset link is invalid or has expired."),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordSchema,
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const DELETE_CONFIRMATION = "DELETE";

export const deleteAccountSchema = z.object({
  password: currentPasswordSchema,
  confirmation: z.literal(DELETE_CONFIRMATION, {
    error: `Type ${DELETE_CONFIRMATION} to confirm.`,
  }),
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;
