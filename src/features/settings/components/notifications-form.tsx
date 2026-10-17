"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { ALERT_THRESHOLD_PRESETS } from "@/features/budgets/constants";
import { applyActionErrors } from "@/lib/form-errors";
import { cn } from "@/lib/utils";

import { updateNotificationsAction } from "../actions";
import { BUDGET_ALERT_OPTIONS } from "../options";
import { type NotificationsInput, notificationsSchema } from "../schemas";

/**
 * Budget warnings shown in the app (the bell in the header). There are no
 * e-mail or push notifications. Saving immediately adds or clears warnings to
 * match the new choice.
 */
export function NotificationsForm({ defaultValues }: { defaultValues: NotificationsInput }) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NotificationsInput>({
    resolver: zodResolver(notificationsSchema),
    defaultValues,
    mode: "onSubmit",
  });
  const { errors, isSubmitting, isDirty } = form.formState;
  const mode = useWatch({ control: form.control, name: "budgetAlertMode" });
  const thresholds = [
    ...new Set([...ALERT_THRESHOLD_PRESETS, Number(defaultValues.defaultAlertThreshold)]),
  ].sort((a, b) => a - b);

  async function onSubmit(values: NotificationsInput) {
    setFormError(null);
    const result = await updateNotificationsAction(values);
    if (!result.ok) {
      setFormError(
        applyActionErrors(result, form.setError, ["budgetAlertMode", "defaultAlertThreshold"]),
      );
      return;
    }
    form.reset(values);
    toast.success("Notification settings saved");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <fieldset className="grid gap-2" aria-describedby="alert-mode-hint">
        <legend className="mb-1 text-sm font-medium">Budget warnings</legend>
        <p id="alert-mode-hint" className="text-sm text-muted-foreground">
          Shown under the bell at the top of the page. In-app only — no emails or phone
          notifications.
        </p>
        {BUDGET_ALERT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              mode === option.value && "border-primary bg-primary/5",
            )}
          >
            <input
              type="radio"
              value={option.value}
              className="mt-1 size-4 accent-[var(--primary)]"
              {...form.register("budgetAlertMode")}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-sm text-muted-foreground">{option.description}</span>
            </span>
          </label>
        ))}
        {errors.budgetAlertMode && (
          <p className="text-sm text-destructive">{errors.budgetAlertMode.message}</p>
        )}
      </fieldset>

      <Controller
        control={form.control}
        name="defaultAlertThreshold"
        render={({ field }) => (
          <FormField
            id="defaultAlertThreshold"
            label="Warning level for new budgets"
            description="Suggested when you add a budget; each budget can have its own."
            error={errors.defaultAlertThreshold?.message}
            className="max-w-xs"
          >
            <SelectField
              value={String(field.value)}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              options={thresholds.map((t) => ({ value: String(t), label: `${t}% of the limit` }))}
            />
          </FormField>
        )}
      />

      <div className="flex flex-col gap-3">
        <FormAlert message={formError} />
        <div>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            {isSubmitting ? "Saving…" : "Save notifications"}
          </Button>
        </div>
      </div>
    </form>
  );
}
