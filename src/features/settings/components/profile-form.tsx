"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyActionErrors } from "@/lib/form-errors";

import { updateProfileAction } from "../actions";
import { type ProfileInput, profileSchema } from "../schemas";

/**
 * Name (editable) and email (shown, not editable). Changing the sign-in email
 * needs a verification e-mail to the new address, which requires an e-mail
 * provider that is not set up yet (docs/PRD.md Q-12) — so it is not offered.
 */
export function ProfileForm({
  email,
  defaultValues,
}: {
  email: string;
  defaultValues: ProfileInput;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues,
    mode: "onSubmit",
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: ProfileInput) {
    setFormError(null);
    const result = await updateProfileAction(values);
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, ["name"]));
      return;
    }
    form.reset(values);
    toast.success("Profile saved");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5 md:grid-cols-2">
      <FormField
        id="name"
        label="Name"
        description="Shown in the menu. Optional."
        error={errors.name?.message}
      >
        <Input autoComplete="name" maxLength={60} {...form.register("name")} />
      </FormField>
      <FormField
        id="email"
        label="Email"
        description="Used to sign in. To change it we must first confirm the new address by email, which isn't available yet."
      >
        <Input value={email} readOnly aria-readonly="true" className="bg-muted" />
      </FormField>
      <div className="flex flex-col gap-3 md:col-span-2">
        <FormAlert message={formError} />
        <div>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            {isSubmitting ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </div>
    </form>
  );
}
