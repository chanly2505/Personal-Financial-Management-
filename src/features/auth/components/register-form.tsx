"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { applyActionErrors } from "@/lib/form-errors";
import { callAction } from "@/lib/action-result";

import { registerAction } from "../actions";
import { PASSWORD_MIN, type RegisterInput, registerSchema } from "../schemas";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: RegisterInput) {
    setFormError(null);
    const result = await callAction(() => registerAction(values));
    if (!result.ok) {
      setFormError(
        applyActionErrors(result, form.setError, ["name", "email", "password", "confirmPassword"]),
      );
      return;
    }
    router.replace(result.data.redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <FormField
        id="name"
        label="Name"
        description="Optional. Shown only to you."
        error={errors.name?.message}
      >
        <Input autoComplete="name" {...form.register("name")} />
      </FormField>
      <FormField id="email" label="Email" error={errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </FormField>
      <FormField
        id="password"
        label="Password"
        description={`At least ${PASSWORD_MIN} characters. A short phrase is easy to remember.`}
        error={errors.password?.message}
        required
      >
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField
        id="confirmPassword"
        label="Confirm password"
        error={errors.confirmPassword?.message}
        required
      >
        <PasswordInput autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <FormAlert message={formError} />
      <Button type="submit" loading={isSubmitting} className="w-full">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
