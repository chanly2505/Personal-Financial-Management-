import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthCard } from "@/features/auth/components/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  // "allowlist" keeps the page reachable for the listed emails; the service decides.
  if (env.REGISTRATION_MODE === "closed") notFound();
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <AuthCard
      title="Create your account"
      description="Track your money in US dollars and riel. Your data stays private to you."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
