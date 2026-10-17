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
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX, PAYEE_MAX } from "@/features/transactions/constants";
import { useFormatPrefs } from "@/components/shared/format-provider";
import { type IsoDate, addDays, formatCalendarDate, isIsoDate } from "@/lib/dates";
import { applyActionErrors } from "@/lib/form-errors";
import { type CurrencyCode, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { createRecurringAction, updateRecurringAction } from "../actions";
import { FREQUENCIES, FREQUENCY_LABELS, MAX_INTERVAL, NAME_MAX } from "../constants";
import { describeSchedule, nextScheduled, occurrencesBetween } from "../schedule";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`),
  type: z.enum(["INCOME", "EXPENSE"]),
  accountId: z.string().min(1, "Choose an account."),
  categoryId: z.string().min(1, "Choose a category."),
  amount: z.string().trim().min(1, "Enter an amount."),
  frequency: z.enum(FREQUENCIES),
  interval: z.string().regex(/^\d{1,3}$/, "Enter a whole number."),
  startOn: z.string().min(1, "Choose a start date."),
  endOn: z.string(),
  payee: z.string().max(PAYEE_MAX, `Use at most ${PAYEE_MAX} characters.`),
  description: z.string().max(NOTE_MAX, `Use at most ${NOTE_MAX} characters.`),
  catchUp: z.boolean(),
});
type Values = z.input<typeof formSchema>;
const FIELDS = [
  "name",
  "type",
  "accountId",
  "categoryId",
  "amount",
  "frequency",
  "interval",
  "startOn",
  "endOn",
  "payee",
  "description",
] as const;

type Props = {
  accounts: { id: string; name: string; currency: CurrencyCode }[];
  categories: { INCOME: { id: string; name: string }[]; EXPENSE: { id: string; name: string }[] };
  today: IsoDate;
} & (
  | { mode: "create" }
  | { mode: "edit"; ruleId: string; expectedUpdatedAt: string; defaults: Omit<Values, "catchUp"> }
);

export function RecurringForm(props: Props) {
  const prefs = useFormatPrefs();
  const router = useRouter();
  const editing = props.mode === "edit";
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: editing
      ? { ...props.defaults, catchUp: false }
      : {
          name: "",
          type: "EXPENSE",
          accountId: props.accounts[0]?.id ?? "",
          categoryId: "",
          amount: "",
          frequency: "MONTHLY",
          interval: "1",
          startOn: props.today,
          endOn: "",
          payee: "",
          description: "",
          catchUp: false,
        },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;
  const [type, accountId, frequency, intervalText, startOn, endOn, catchUp] = useWatch({
    control: form.control,
    name: ["type", "accountId", "frequency", "interval", "startOn", "endOn", "catchUp"],
  });
  const currency = props.accounts.find((a) => a.id === accountId)?.currency ?? "USD";
  const interval = Math.min(Math.max(Number(intervalText) || 1, 1), MAX_INTERVAL);

  // Live preview of the schedule (the same calendar logic as the engine).
  const validStart = isIsoDate(startOn) ? startOn : null;
  const validEnd = endOn && isIsoDate(endOn) ? endOn : null;
  const schedule = validStart
    ? { frequency, interval, startOn: validStart, endOn: validEnd }
    : null;
  const past =
    !editing && schedule && validStart! < props.today
      ? occurrencesBetween(schedule, validStart!, addDays(props.today, -1), 400)
      : [];
  const firstFuture = schedule ? nextScheduled(schedule, props.today) : null;
  const preview = schedule
    ? occurrencesBetween(
        schedule,
        catchUp && past.length > 0 ? validStart! : props.today,
        addDays(props.today, 800),
        3,
      )
    : [];

  async function onSubmit(values: Values) {
    setFormError(null);
    const parsed = parseMoney(values.amount, currency);
    if (!parsed.ok) {
      form.setError("amount", { message: parsed.error }, { shouldFocus: true });
      return;
    }
    const input = {
      name: values.name,
      type: values.type,
      accountId: values.accountId,
      categoryId: values.categoryId,
      amount: values.amount,
      frequency: values.frequency,
      interval: Number(values.interval),
      startOn: values.startOn,
      endOn: values.endOn || undefined,
      payee: values.payee,
      description: values.description,
    };
    const result = editing
      ? await updateRecurringAction({
          ...input,
          id: props.ruleId,
          expectedUpdatedAt: props.expectedUpdatedAt,
        })
      : await createRecurringAction({ ...input, catchUp: values.catchUp && past.length > 0 });
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, FIELDS));
      return;
    }
    toast.success(editing ? "Recurring rule updated" : "Recurring rule added");
    router.push(`/recurring/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["EXPENSE", "INCOME"] as const).map((option) => (
            <label
              key={option}
              className={cn(
                "relative flex h-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium",
                "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                type === option
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name="type"
                value={option}
                checked={type === option}
                onChange={() => {
                  form.setValue("type", option);
                  form.setValue("categoryId", "");
                }}
                className="absolute inset-0 cursor-pointer appearance-none rounded-md opacity-0"
              />
              {option === "EXPENSE" ? "Expense" : "Income"}
            </label>
          ))}
        </div>
      </fieldset>

      <FormField id="name" label="Name" error={errors.name?.message} required>
        <Input
          autoComplete="off"
          maxLength={NAME_MAX}
          placeholder={type === "INCOME" ? "e.g. Salary" : "e.g. Rent, Netflix, Phone bill"}
          {...form.register("name")}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="amount" label="Amount" error={errors.amount?.message} required>
          <MoneyInput currency={currency} {...form.register("amount")} />
        </FormField>
        <Controller
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormField id="accountId" label="Account" error={errors.accountId?.message} required>
              <SelectField
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="Choose an account"
                options={props.accounts.map((a) => ({
                  value: a.id,
                  label: `${a.name} · ${a.currency}`,
                }))}
              />
            </FormField>
          )}
        />
      </div>

      <Controller
        control={form.control}
        name="categoryId"
        render={({ field }) => (
          <FormField id="categoryId" label="Category" error={errors.categoryId?.message} required>
            <SelectField
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              placeholder="Choose a category"
              options={props.categories[type].map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormField>
        )}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="frequency"
          render={({ field }) => (
            <FormField id="frequency" label="Repeats" error={errors.frequency?.message}>
              <SelectField
                value={field.value}
                onValueChange={field.onChange}
                options={FREQUENCIES.map((f) => ({
                  value: f,
                  label: f === "WEEKLY" ? "Weekly" : f === "MONTHLY" ? "Monthly" : "Yearly",
                }))}
              />
            </FormField>
          )}
        />
        <FormField
          id="interval"
          label={`Every how many ${FREQUENCY_LABELS[frequency].many}`}
          error={errors.interval?.message}
        >
          <Input inputMode="numeric" className="w-28" {...form.register("interval")} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="startOn"
          label="Start date"
          description="The first date it applies. Monthly dates after the 28th use the last day in shorter months."
          error={errors.startOn?.message}
          required
        >
          <DateInput {...form.register("startOn")} />
        </FormField>
        <FormField id="endOn" label="End date (optional)" error={errors.endOn?.message}>
          <DateInput min={startOn} {...form.register("endOn")} />
        </FormField>
      </div>

      {past.length > 0 && (
        <label className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...form.register("catchUp")}
          />
          <span>
            Also record the {past.length} past {past.length === 1 ? "occurrence" : "occurrences"} (
            {formatCalendarDate(past[0]!, undefined, prefs)}
            {past.length > 1 &&
              ` – ${formatCalendarDate(past[past.length - 1]!, undefined, prefs)}`}
            ).
            <span className="block text-xs text-muted-foreground">
              Off by default: past dates are only recorded if you choose this. They post on the next
              scheduled run.
            </span>
          </span>
        </label>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="payee"
          label={type === "INCOME" ? "From (optional)" : "Paid to (optional)"}
          error={errors.payee?.message}
        >
          <Input autoComplete="off" maxLength={PAYEE_MAX} {...form.register("payee")} />
        </FormField>
        <FormField id="description" label="Note (optional)" error={errors.description?.message}>
          <Textarea rows={1} maxLength={NOTE_MAX} {...form.register("description")} />
        </FormField>
      </div>

      <section
        aria-label="Schedule preview"
        className="rounded-lg border bg-card px-4 py-3 text-sm"
      >
        {schedule ? (
          <>
            <p className="font-medium">{describeSchedule(schedule, prefs)}</p>
            <p className="mt-1 text-muted-foreground">
              {preview.length > 0
                ? `Next: ${preview.map((d) => formatCalendarDate(d, props.today, prefs)).join(", ")}`
                : firstFuture
                  ? ""
                  : "No dates left before the end date."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A rule is a schedule. Each date becomes a real transaction only when it is posted, on
              or after that date.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Choose a start date to see the schedule.</p>
        )}
      </section>

      <FormAlert message={formError} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Add recurring rule"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
