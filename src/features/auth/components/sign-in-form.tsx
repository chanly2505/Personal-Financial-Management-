"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { applyActionErrors } from "@/lib/form-errors";

import { signInAction } from "../actions";
import { type SignInInput, signInSchema } from "../schemas";

export function SignInForm({
  callbackUrl,
  recoveryEnabled,
}: {
  callbackUrl?: string;
  recoveryEnabled: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", callbackUrl },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SignInInput) {
    setFormError(null);
    const result = await signInAction(values);
    if (!result.ok) {
      form.resetField("password");
      setFormError(applyActionErrors(result, form.setError, ["email", "password"]));
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>
      <FormField id="password" label="Password" error={errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...form.register("password")} />
      </FormField>
      {recoveryEnabled && (
        <Link
          href="/forgot-password"
          className="-mt-2 self-end rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Forgot password?
        </Link>
      )}
      <FormAlert message={formError} />
      <Button type="submit" loading={isSubmitting} className="w-full">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
