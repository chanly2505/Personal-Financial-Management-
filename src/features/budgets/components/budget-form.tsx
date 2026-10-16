"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyActionErrors } from "@/lib/form-errors";
import { CURRENCIES, type CurrencyCode, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { createBudgetAction, updateBudgetAction } from "../actions";
import {
  ALERT_THRESHOLD_PRESETS,
  MAX_ALERT_THRESHOLD,
  MIN_ALERT_THRESHOLD,
  MONTH_PATTERN,
} from "../constants";

const formSchema = z.object({
  categoryId: z.string().min(1, "Choose a category."),
  currency: z.enum(["USD", "KHR"]),
  month: z.string().regex(MONTH_PATTERN, "Choose a month (YYYY-MM)."),
  amount: z.string().trim().min(1, "Enter a limit."),
  alertThresholdPercent: z
    .string()
    .regex(/^\d{1,3}$/, "Enter a whole percentage.")
    .refine(
      (v) => Number(v) >= MIN_ALERT_THRESHOLD && Number(v) <= MAX_ALERT_THRESHOLD,
      `Use ${MIN_ALERT_THRESHOLD}–${MAX_ALERT_THRESHOLD} %.`,
    ),
});
type Values = z.input<typeof formSchema>;
const FIELDS = ["categoryId", "currency", "month", "amount", "alertThresholdPercent"] as const;

type Props = {
  categories: { id: string; name: string }[];
  currencies: CurrencyCode[];
  minMonth: string;
  maxMonth: string;
} & (
  | { mode: "create"; defaults: Pick<Values, "categoryId" | "currency" | "month"> }
  | {
      mode: "edit";
      budgetId: string;
      expectedUpdatedAt: string;
      categoryName: string;
      defaults: Values;
    }
);

/**
 * Create or edit a monthly budget. Category, currency and month identify the
 * budget, so editing changes only the limit and the warning threshold.
 */
export function BudgetForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: "", alertThresholdPercent: "80", ...props.defaults },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;
  const [currency, threshold] = useWatch({
    control: form.control,
    name: ["currency", "alertThresholdPercent"],
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    const parsed = parseMoney(values.amount, values.currency);
    if (!parsed.ok) {
      form.setError("amount", { message: parsed.error }, { shouldFocus: true });
      return;
    }
    const alertThresholdPercent = Number(values.alertThresholdPercent);
    const result = editing
      ? await updateBudgetAction({
          id: props.budgetId,
          amount: values.amount,
          alertThresholdPercent,
          expectedUpdatedAt: props.expectedUpdatedAt,
        })
      : await createBudgetAction({ ...values, alertThresholdPercent });
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, FIELDS));
      return;
    }
    toast.success(editing ? "Budget updated" : "Budget added");
    router.push(`/budgets?month=${values.month}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {editing ? (
        <dl className="grid gap-1 rounded-lg bg-muted px-4 py-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Category</dt>
            <dd className="font-medium">{props.categoryName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Currency</dt>
            <dd className="font-medium">{props.defaults.currency}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Month</dt>
            <dd className="font-medium">{props.defaults.month}</dd>
          </div>
        </dl>
      ) : (
        <>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormField
                id="categoryId"
                label="Expense category"
                error={errors.categoryId?.message}
                required
              >
                <SelectField
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Choose a category"
                  options={props.categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </FormField>
            )}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Controller
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormField
                  id="currency"
                  label="Currency"
                  description="Counts expenses from your accounts in this currency."
                  error={errors.currency?.message}
                >
                  <SelectField
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    options={props.currencies.map((c) => ({
                      value: c,
                      label: CURRENCIES[c].label,
                    }))}
                  />
                </FormField>
              )}
            />
            <FormField id="month" label="Month" error={errors.month?.message} required>
              <Input
                type="month"
                min={props.minMonth}
                max={props.maxMonth}
                placeholder="YYYY-MM"
                {...form.register("month")}
              />
            </FormField>
          </div>
        </>
      )}

      <FormField
        id="amount"
        label="Monthly limit"
        description="The most you want to spend in this category this month."
        error={errors.amount?.message}
        required
      >
        <MoneyInput currency={currency} autoFocus={editing} {...form.register("amount")} />
      </FormField>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Warn me at</legend>
        <p className="-mt-1 text-xs text-muted-foreground">
          You get one in-app warning when spending reaches this share of the limit, and another at
          100%.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {ALERT_THRESHOLD_PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={threshold === String(p)}
              className={cn(threshold === String(p) && "border-primary bg-accent")}
              onClick={() =>
                form.setValue("alertThresholdPercent", String(p), { shouldValidate: true })
              }
            >
              {p}%
            </Button>
          ))}
          <div className="flex items-center gap-2">
            <label htmlFor="alertThresholdPercent" className="text-sm text-muted-foreground">
              or
            </label>
            <Input
              id="alertThresholdPercent"
              inputMode="numeric"
              className="w-20"
              aria-describedby={errors.alertThresholdPercent ? "threshold-error" : undefined}
              aria-invalid={errors.alertThresholdPercent ? true : undefined}
              aria-label="Warning threshold in percent"
              {...form.register("alertThresholdPercent")}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>
        {errors.alertThresholdPercent && (
          <p id="threshold-error" className="text-sm text-destructive">
            {errors.alertThresholdPercent.message}
          </p>
        )}
      </fieldset>

      <FormAlert message={formError} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Add budget"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
