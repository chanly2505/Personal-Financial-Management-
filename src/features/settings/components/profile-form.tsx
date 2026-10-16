"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyActionErrors } from "@/lib/form-errors";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/money";

import { updateProfileAction } from "../actions";
import { type ProfileInput, profileSchema } from "../schemas";

const FIELDS = ["name", "baseCurrency", "timezone", "exchangeRateKhrPerUsd"] as const;

export function ProfileForm({
  email,
  defaultValues,
  timezones,
}: {
  email: string;
  defaultValues: ProfileInput;
  timezones: string[];
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues,
    mode: "onTouched",
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: ProfileInput) {
    setFormError(null);
    const result = await updateProfileAction(values);
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, FIELDS));
      return;
    }
    form.reset(values);
    toast.success("Profile saved");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5 md:grid-cols-2">
      <FormField id="email" label="Email" description="Used to sign in. Can't be changed yet.">
        <Input value={email} readOnly disabled />
      </FormField>
      <FormField id="name" label="Name" error={errors.name?.message}>
        <Input autoComplete="name" {...form.register("name")} />
      </FormField>

      <Controller
        control={form.control}
        name="baseCurrency"
        render={({ field }) => (
          <FormField
            id="baseCurrency"
            label="Main currency"
            description="Used for approximate combined totals."
            error={errors.baseCurrency?.message}
          >
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {CURRENCIES[code].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      />

      <Controller
        control={form.control}
        name="timezone"
        render={({ field }) => (
          <FormField
            id="timezone"
            label="Timezone"
            description={`Decides what "today" and "this month" mean for you.`}
            error={errors.timezone?.message}
          >
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timezones.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      />

      <FormField
        id="exchangeRateKhrPerUsd"
        label="Riel per US dollar"
        description="Your own rate, used only for approximate combined totals. Records are never converted."
        error={errors.exchangeRateKhrPerUsd?.message}
      >
        <Input inputMode="decimal" autoComplete="off" {...form.register("exchangeRateKhrPerUsd")} />
      </FormField>

      <div className="flex flex-col gap-3 md:col-span-2">
        <FormAlert message={formError} />
        <div>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
