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
import { applyActionErrors } from "@/lib/form-errors";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode, parseMoney } from "@/lib/money";

import { createGoalAction, updateGoalAction } from "../actions";
import { NAME_MAX, NOTE_MAX } from "../constants";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`),
  currency: z.enum(["USD", "KHR"]),
  target: z.string().trim().min(1, "Enter a target amount."),
  targetDate: z.string(),
  accountId: z.string(),
  note: z.string().max(NOTE_MAX, `Use at most ${NOTE_MAX} characters.`),
});
type Values = z.input<typeof formSchema>;
const FIELDS = ["name", "currency", "target", "targetDate", "accountId", "note"] as const;
const NONE = "none";

type Props = {
  accounts: { id: string; name: string; currency: CurrencyCode }[];
  defaultCurrency: CurrencyCode;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      goalId: string;
      expectedUpdatedAt: string;
      currencyLocked: boolean;
      defaults: Values;
    }
);

/** Create or edit a goal. The linked account is optional and must use the goal's currency. */
export function GoalForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: editing
      ? props.defaults
      : {
          name: "",
          currency: props.defaultCurrency,
          target: "",
          targetDate: "",
          accountId: NONE,
          note: "",
        },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;
  const currency = useWatch({ control: form.control, name: "currency" });
  const accounts = props.accounts.filter((a) => a.currency === currency);

  async function onSubmit(values: Values) {
    setFormError(null);
    const parsed = parseMoney(values.target, values.currency);
    if (!parsed.ok) {
      form.setError("target", { message: parsed.error }, { shouldFocus: true });
      return;
    }
    const input = {
      ...values,
      accountId: values.accountId === NONE ? undefined : values.accountId,
    };
    const result = editing
      ? await updateGoalAction({
          ...input,
          id: props.goalId,
          expectedUpdatedAt: props.expectedUpdatedAt,
        })
      : await createGoalAction(input);
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, FIELDS));
      return;
    }
    toast.success(editing ? "Goal updated" : "Goal added");
    router.push(`/goals/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <FormField id="name" label="Goal name" error={errors.name?.message} required>
        <Input
          autoComplete="off"
          maxLength={NAME_MAX}
          placeholder="e.g. Emergency fund, New phone"
          {...form.register("name")}
        />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormField
              id="currency"
              label="Currency"
              description={
                editing && props.currencyLocked ? "Fixed once money has been set aside." : undefined
              }
              error={errors.currency?.message}
            >
              <SelectField
                value={field.value}
                disabled={editing && props.currencyLocked}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue("accountId", NONE);
                }}
                options={CURRENCY_CODES.map((c) => ({ value: c, label: CURRENCIES[c].label }))}
              />
            </FormField>
          )}
        />
        <FormField id="target" label="Target amount" error={errors.target?.message} required>
          <MoneyInput currency={currency} {...form.register("target")} />
        </FormField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="targetDate"
          label="Target date (optional)"
          description="We'll show how much to set aside each month."
          error={errors.targetDate?.message}
        >
          <DateInput {...form.register("targetDate")} />
        </FormField>
        <Controller
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormField
              id="accountId"
              label="Kept in (optional)"
              description="Where this money lives. Setting money aside never changes the balance."
              error={errors.accountId?.message}
            >
              <SelectField
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: NONE, label: "No specific account" },
                  ...accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` })),
                ]}
              />
            </FormField>
          )}
        />
      </div>
      <FormField id="note" label="Note (optional)" error={errors.note?.message}>
        <Textarea rows={2} maxLength={NOTE_MAX} {...form.register("note")} />
      </FormField>
      <FormAlert message={formError} />
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Add goal"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
