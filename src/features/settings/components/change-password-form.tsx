"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import {
  type ChangePasswordInput,
  PASSWORD_MIN,
  changePasswordSchema,
} from "@/features/auth/schemas";
import { applyActionErrors } from "@/lib/form-errors";
import { callAction } from "@/lib/action-result";

import { changePasswordAction } from "../actions";

export function ChangePasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ChangePasswordInput) {
    setFormError(null);
    // On success the action signs this session out and redirects to sign-in.
    const result = await callAction(() => changePasswordAction(values));
    if (!result.ok) {
      form.resetField("currentPassword");
      setFormError(
        applyActionErrors(result, form.setError, [
          "currentPassword",
          "newPassword",
          "confirmPassword",
        ]),
      );
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid max-w-form gap-5">
      <FormField
        id="currentPassword"
        label="Current password"
        error={errors.currentPassword?.message}
      >
        <PasswordInput autoComplete="current-password" {...form.register("currentPassword")} />
      </FormField>
      <FormField
        id="newPassword"
        label="New password"
        description={`At least ${PASSWORD_MIN} characters.`}
        error={errors.newPassword?.message}
      >
        <PasswordInput autoComplete="new-password" {...form.register("newPassword")} />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm new password"
        error={errors.confirmPassword?.message}
      >
        <PasswordInput autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <FormAlert message={formError} />
      <div>
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Changing…" : "Change password"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        You&apos;ll be signed out on every device, including this one.
      </p>
    </form>
  );
}
