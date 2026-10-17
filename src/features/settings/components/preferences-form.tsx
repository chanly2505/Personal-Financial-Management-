"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { applyActionErrors } from "@/lib/form-errors";
import { formatDate } from "@/lib/format/dates";
import type { FormatPrefs } from "@/lib/format/preferences";
import { CURRENCIES, CURRENCY_CODES, formatMoney } from "@/lib/money";

import { updatePreferencesAction } from "../actions";
import { CURRENCY_DISPLAY_OPTIONS, DATE_FORMAT_OPTIONS, NUMBER_FORMAT_OPTIONS } from "../options";
import { type PreferencesInput, preferencesSchema } from "../schemas";

const FIELDS = [
  "baseCurrency",
  "timezone",
  "dateFormat",
  "numberFormat",
  "currencyDisplay",
] as const;

/**
 * Region and display preferences with a live preview. Saving re-renders every
 * page in the new format; stored amounts and dates are never changed.
 */
export function PreferencesForm({
  defaultValues,
  timezones,
  today,
}: {
  defaultValues: PreferencesInput;
  timezones: string[];
  /** Today in the saved timezone, for the preview. */
  today: string;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues,
    mode: "onSubmit",
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const draft = useWatch({ control: form.control });
  const preview: FormatPrefs = {
    dateFormat: draft.dateFormat ?? "D_MMM_Y",
    numberFormat: draft.numberFormat ?? "COMMA_DOT",
    currencyDisplay: draft.currencyDisplay ?? "SYMBOL",
  };

  async function onSubmit(values: PreferencesInput) {
    setFormError(null);
    const result = await updatePreferencesAction(values);
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, FIELDS));
      return;
    }
    form.reset(values);
    toast.success("Preferences saved");
  }

  const select = (
    name: (typeof FIELDS)[number],
    label: string,
    description: string,
    options: readonly { value: string; label: string }[],
    contentClassName?: string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormField id={name} label={label} description={description} error={errors[name]?.message}>
          <SelectField
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            options={options}
            contentClassName={contentClassName}
          />
        </FormField>
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5 md:grid-cols-2">
      {select(
        "baseCurrency",
        "Default currency",
        "Suggested first when you add accounts, budgets and goals, and shown first on the dashboard.",
        CURRENCY_CODES.map((code) => ({ value: code, label: CURRENCIES[code].label })),
      )}
      {select(
        "timezone",
        "Timezone",
        `Decides what "today" and "this month" mean for you.`,
        timezones.map((tz) => ({ value: tz, label: tz.replaceAll("_", " ") })),
        "max-h-72",
      )}
      {select("dateFormat", "Date format", "How dates are written.", DATE_FORMAT_OPTIONS)}
      {select(
        "numberFormat",
        "Number format",
        "Thousands separator and decimal mark.",
        NUMBER_FORMAT_OPTIONS,
      )}
      {select(
        "currencyDisplay",
        "Show currencies as",
        "Codes are clearest when you use both currencies.",
        CURRENCY_DISPLAY_OPTIONS,
      )}

      <div
        className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3 text-sm"
        aria-live="polite"
      >
        <p className="font-medium">Preview</p>
        <p className="tabular-nums">
          {formatMoney(123456n, "USD", { prefs: preview })} ·{" "}
          {formatMoney(4100000n, "KHR", { prefs: preview })} · {formatDate(today, preview)}
        </p>
        <p className="text-xs text-muted-foreground">
          Only the display changes. Your records are never converted or edited.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:col-span-2">
        <FormAlert message={formError} />
        <div>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            {isSubmitting ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </div>
    </form>
  );
}
