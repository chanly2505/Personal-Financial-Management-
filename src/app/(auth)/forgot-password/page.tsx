import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { passwordRecoveryEnabled } from "@/server/env";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  // Without an email transport there is no way to deliver a link (docs/PRD.md Q-12).
  if (!passwordRecoveryEnabled) notFound();

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
