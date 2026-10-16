import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormAlert } from "@/components/shared/form-alert";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { passwordRecoveryEnabled } from "@/server/env";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  if (!passwordRecoveryEnabled) notFound();
  const { token } = await searchParams;
  const validToken = typeof token === "string" && token.length >= 32 && token.length <= 128;

  return (
    <AuthCard
      title="Choose a new password"
      description="You'll be signed out on every device and can sign in with the new password."
      footer={
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      {validToken ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <FormAlert message="This reset link is invalid or has expired. Please request a new one." />
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
