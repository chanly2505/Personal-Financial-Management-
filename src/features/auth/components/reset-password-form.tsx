"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { applyActionErrors } from "@/lib/form-errors";

import { resetPasswordAction } from "../actions";
import { PASSWORD_MIN, type ResetPasswordInput, resetPasswordSchema } from "../schemas";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);
    const result = await resetPasswordAction(values);
    if (!result.ok) {
      setFormError(
        result.fieldErrors?.token ??
          applyActionErrors(result, form.setError, ["password", "confirmPassword"]),
      );
      return;
    }
    router.replace("/sign-in?notice=password-reset");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <FormField
        id="password"
        label="New password"
        description={`At least ${PASSWORD_MIN} characters.`}
        error={errors.password?.message}
      >
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        error={errors.confirmPassword?.message}
      >
        <PasswordInput autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <FormAlert message={formError ?? errors.token?.message} />
      <Button type="submit" loading={isSubmitting} className="w-full">
        {isSubmitting ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
