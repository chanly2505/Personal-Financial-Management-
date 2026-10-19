import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FormAlert } from "@/components/shared/form-alert";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { safeCallbackPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/session";
import { passwordRecoveryEnabled, registrationOpen } from "@/server/env";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "password-changed": "Your password was changed. Please sign in with your new password.",
  "password-reset": "Your password was reset. Please sign in with your new password.",
  "signed-out-everywhere": "You've been signed out on all devices.",
  "account-deleted": "Your account and all of its data have been deleted.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : undefined;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  if (await getCurrentUser()) redirect(safeCallbackPath(callbackUrl));

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Enter your details to continue."
      footer={
        registrationOpen ? (
          <>
            New here?{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create an account
            </Link>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert variant="success" message={notice} />
        <SignInForm callbackUrl={callbackUrl} recoveryEnabled={passwordRecoveryEnabled} />
      </div>
    </AuthCard>
  );
}
