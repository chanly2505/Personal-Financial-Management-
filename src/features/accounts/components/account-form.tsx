"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyActionErrors } from "@/lib/form-errors";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode, parseMoney } from "@/lib/money";
import { callAction } from "@/lib/action-result";

import { createAccountAction, updateAccountAction } from "../actions";
import {
  ACCOUNT_PRESETS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  type AccountType,
} from "../constants";
import { type CreateAccountInput, createAccountSchema } from "../schemas";

type Values = CreateAccountInput;

const FIELDS = ["name", "type", "currency", "openingBalance"] as const;

/** Client-side check with the same parser the server uses, so messages match. */
function validateOpeningBalance(value: string, currency: CurrencyCode): true | string {
  if (value.trim() === "") return true;
  const result = parseMoney(value, currency, { allowNegative: true, allowZero: true });
  return result.ok ? true : result.error;
}

export function AccountForm(
  props:
    | { mode: "create"; defaultCurrency?: CurrencyCode }
    | {
        mode: "edit";
        accountId: string;
        defaultValues: {
          name: string;
          type: AccountType;
          currency: CurrencyCode;
          openingBalance: string;
        };
        hasHistory: boolean;
      },
) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const editing = props.mode === "edit";
  const form = useForm<Values>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: editing
      ? props.defaultValues
      : { name: "", type: "BANK", currency: props.defaultCurrency ?? "USD", openingBalance: "" },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;
  const currency = useWatch({ control: form.control, name: "currency" });

  async function onSubmit(values: Values) {
    setFormError(null);
    const check = validateOpeningBalance(values.openingBalance ?? "", values.currency);
    if (check !== true) {
      form.setError("openingBalance", { message: check }, { shouldFocus: true });
      return;
    }
    const result = editing
      ? await callAction(() =>
          updateAccountAction({
            id: props.accountId,
            name: values.name,
            type: values.type,
            openingBalance: values.openingBalance,
          }),
        )
      : await callAction(() => createAccountAction(values));
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, FIELDS));
      return;
    }
    toast.success(editing ? "Account updated" : "Account added");
    router.push(`/accounts/${result.data.id}`);
    router.refresh();
  }

  function applyPreset(preset: (typeof ACCOUNT_PRESETS)[number]) {
    form.setValue("name", preset.name, { shouldDirty: true, shouldValidate: true });
    form.setValue("type", preset.type, { shouldDirty: true });
    form.setValue("currency", preset.currency, { shouldDirty: true });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Start from a common account</legend>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset)}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Suggestions only — you can use any name. Never enter bank passwords or card numbers.
          </p>
        </fieldset>
      )}

      <FormField id="name" label="Account name" error={errors.name?.message} required>
        <Input autoComplete="off" placeholder="e.g. ABA Savings" {...form.register("name")} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormField id="type" label="Type" error={errors.type?.message}>
              <SelectField
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                options={ACCOUNT_TYPES.map((type) => ({
                  value: type,
                  label: ACCOUNT_TYPE_LABELS[type],
                }))}
              />
            </FormField>
          )}
        />

        <Controller
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormField
              id="currency"
              label="Currency"
              description={
                editing
                  ? "Can't be changed, so past records stay in one currency."
                  : "Can't be changed later."
              }
              error={errors.currency?.message}
            >
              <SelectField
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                disabled={editing}
                options={CURRENCY_CODES.map((code) => ({
                  value: code,
                  label: CURRENCIES[code].label,
                }))}
              />
            </FormField>
          )}
        />
      </div>

      <FormField
        id="openingBalance"
        label="Opening balance"
        description={
          editing && props.hasHistory
            ? "Changing this also changes the balance after every past record."
            : currency === "KHR"
              ? "How much is in the account now, in whole riel. Leave empty for zero. Use a minus sign if it's overdrawn."
              : "How much is in the account now. Leave empty for zero. Use a minus sign if it's overdrawn."
        }
        error={errors.openingBalance?.message}
      >
        <MoneyInput currency={currency} {...form.register("openingBalance")} />
      </FormField>

      <FormAlert message={formError} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Add account"}
        </Button>
      </div>
    </form>
  );
}
