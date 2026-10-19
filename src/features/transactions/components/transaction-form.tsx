"use client";

import { type BaseSyntheticEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, type FieldErrors, type Resolver, useForm, useWatch } from "react-hook-form";
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
import type { IsoDate } from "@/lib/dates";
import { applyActionErrors } from "@/lib/form-errors";
import { type CurrencyCode, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { callAction } from "@/lib/action-result";

import {
  createEntryAction,
  createTransferAction,
  updateEntryAction,
  updateTransferAction,
} from "../actions";
import { KIND_LABELS, type LedgerKind, NOTE_MAX, PAYEE_MAX } from "../constants";

export interface FormAccount {
  id: string;
  name: string;
  currency: CurrencyCode;
}

export interface FormCategory {
  id: string;
  name: string;
  isArchived?: boolean;
}

const KIND_ORDER: LedgerKind[] = ["EXPENSE", "INCOME", "TRANSFER"];

const formSchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  accountId: z.string().min(1, "Choose an account."),
  categoryId: z.string(),
  toAccountId: z.string(),
  amount: z.string().trim().min(1, "Enter an amount."),
  occurredOn: z.string().min(1, "Choose a date."),
  payee: z.string().trim().max(PAYEE_MAX, `Use at most ${PAYEE_MAX} characters.`),
  note: z.string().trim().max(NOTE_MAX, `Use at most ${NOTE_MAX} characters.`),
});

/** Rules that depend on the type. Kept outside the schema so they run even when other fields fail. */
function crossFieldErrors(v: z.input<typeof formSchema>): Partial<Record<keyof typeof v, string>> {
  if (v.kind === "TRANSFER") {
    if (!v.toAccountId) return { toAccountId: "Choose the account the money goes to." };
    if (v.toAccountId === v.accountId) return { toAccountId: "Choose two different accounts." };
    return {};
  }
  return v.categoryId ? {} : { categoryId: "Choose a category." };
}

const baseResolver = zodResolver(formSchema);
const resolver: Resolver<z.input<typeof formSchema>> = async (values, context, options) => {
  const result = await baseResolver(values, context, options);
  const extra = crossFieldErrors(values);
  if (Object.keys(extra).length === 0) return result;
  const errors: FieldErrors<z.input<typeof formSchema>> = { ...result.errors };
  for (const [field, message] of Object.entries(extra)) {
    const key = field as keyof typeof values;
    errors[key] ??= { type: "custom", message };
  }
  return { values: {}, errors };
};

type Values = z.input<typeof formSchema>;

/** Server field names → form field names. */
const SERVER_FIELDS: Record<string, keyof Values> = {
  type: "kind",
  accountId: "accountId",
  fromAccountId: "accountId",
  toAccountId: "toAccountId",
  categoryId: "categoryId",
  amount: "amount",
  occurredOn: "occurredOn",
  payee: "payee",
  note: "note",
};

const FORM_FIELDS = Object.keys(SERVER_FIELDS);

type Props = {
  accounts: FormAccount[];
  categories: { INCOME: FormCategory[]; EXPENSE: FormCategory[] };
  minDate: IsoDate;
  maxDate: IsoDate;
} & (
  | { mode: "create"; defaults: Partial<Values> & { occurredOn: IsoDate } }
  | { mode: "edit"; recordId: string; expectedUpdatedAt: string; defaults: Values }
);

function newRequestId() {
  return crypto.randomUUID();
}

/**
 * Add or edit an income, expense or transfer. Built for fast entry: the amount
 * has focus, Enter saves, and "Save and add another" keeps the account, category
 * and date for the next record. Each create carries a one-time request id, so
 * a double click or a retry after a network error never records it twice.
 */
export function TransactionForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  // Bumped after "Save and add another" so the amount is focused once the reset has rendered.
  const [entryCount, setEntryCount] = useState(0);

  const form = useForm<Values>({
    resolver,
    defaultValues: {
      kind: "EXPENSE",
      accountId: props.accounts[0]?.id ?? "",
      categoryId: "",
      toAccountId: "",
      amount: "",
      payee: "",
      note: "",
      ...props.defaults,
    },
    // Validate on submit, then live while fixing. (Validating on blur would fire as
    // soon as focus leaves the auto-focused amount, shifting the layout under the
    // pointer before the click on "Save" lands.)
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (entryCount > 0 && !isSubmitting) form.setFocus("amount");
  }, [entryCount, isSubmitting, form]);
  const [kind, accountId] = useWatch({ control: form.control, name: ["kind", "accountId"] });

  const account = props.accounts.find((a) => a.id === accountId);
  const currency: CurrencyCode = account?.currency ?? "USD";
  const isTransfer = kind === "TRANSFER";
  const categories = isTransfer ? [] : props.categories[kind];
  const toAccounts = props.accounts.filter((a) => a.id !== accountId && a.currency === currency);
  const otherCurrencyCount = props.accounts.filter(
    (a) => a.id !== accountId && a.currency !== currency,
  ).length;

  function setKind(next: LedgerKind) {
    form.setValue("kind", next, { shouldDirty: true });
    // A category belongs to one type; clear it when switching.
    form.setValue("categoryId", "", { shouldDirty: true });
    form.clearErrors();
  }

  async function onSubmit(values: Values, event?: BaseSyntheticEvent) {
    // Which button submitted? (Enter uses the first one: plain "Save".)
    const submitter = (event?.nativeEvent as SubmitEvent | undefined)?.submitter;
    const addAnother = submitter?.dataset.intent === "another";
    setFormError(null);
    const parsed = parseMoney(values.amount, currency);
    if (!parsed.ok) {
      form.setError("amount", { message: parsed.error }, { shouldFocus: true });
      return;
    }
    const common = {
      amount: values.amount,
      occurredOn: values.occurredOn,
      note: values.note,
    };
    let result;
    if (values.kind === "TRANSFER") {
      const transfer = {
        ...common,
        fromAccountId: values.accountId,
        toAccountId: values.toAccountId,
      };
      result = editing
        ? await callAction(() =>
            updateTransferAction({
              ...transfer,
              id: props.recordId,
              expectedUpdatedAt: props.expectedUpdatedAt,
            }),
          )
        : await callAction(() => createTransferAction({ ...transfer, clientRequestId: requestId }));
    } else {
      const entry = {
        ...common,
        type: values.kind,
        accountId: values.accountId,
        categoryId: values.categoryId,
        payee: values.payee,
      };
      result = editing
        ? await callAction(() =>
            updateEntryAction({
              ...entry,
              id: props.recordId,
              expectedUpdatedAt: props.expectedUpdatedAt,
            }),
          )
        : await callAction(() => createEntryAction({ ...entry, clientRequestId: requestId }));
    }

    if (!result.ok) {
      const mapped = {
        ...result,
        fieldErrors: Object.fromEntries(
          Object.entries(result.fieldErrors ?? {}).map(([key, message]) => [
            SERVER_FIELDS[key] ?? key,
            message,
          ]),
        ),
      };
      setFormError(applyActionErrors(mapped, form.setError, FORM_FIELDS as (keyof Values)[]));
      return;
    }

    const label = KIND_LABELS[values.kind].toLowerCase();
    if (editing) {
      toast.success("Changes saved");
      router.push(`/transactions/${props.recordId}`);
      router.refresh();
      return;
    }
    setRequestId(newRequestId());
    if (addAnother) {
      toast.success(`Saved ${label}. Add the next one.`);
      form.reset({ ...values, amount: "", payee: "", note: "" });
      setEntryCount((n) => n + 1);
      router.refresh();
      return;
    }
    toast.success(`Saved ${label}`);
    router.push("/transactions");
    router.refresh();
  }

  const accountOptions = props.accounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${a.currency}`,
  }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {KIND_ORDER.map((option) => {
            // A record keeps its family when edited: entries switch between
            // income and expense; a transfer stays a transfer.
            const locked =
              editing && (option === "TRANSFER") !== (props.defaults.kind === "TRANSFER");
            const checked = kind === option;
            return (
              <label
                key={option}
                className={cn(
                  "relative flex h-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors",
                  "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  checked
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                  locked && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={checked}
                  disabled={locked}
                  onChange={() => setKind(option)}
                  className="absolute inset-0 cursor-[inherit] appearance-none rounded-md opacity-0"
                />
                {KIND_LABELS[option]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <FormField id="amount" label="Amount" error={errors.amount?.message} required>
        <MoneyInput
          currency={currency}
          autoFocus
          className="h-11 text-lg"
          {...form.register("amount")}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormField
              id="accountId"
              label={isTransfer ? "From account" : "Account"}
              error={errors.accountId?.message}
              required
            >
              <SelectField
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  const next = props.accounts.find((a) => a.id === value);
                  const to = props.accounts.find((a) => a.id === form.getValues("toAccountId"));
                  if (to && (to.id === value || to.currency !== next?.currency)) {
                    form.setValue("toAccountId", "");
                  }
                }}
                onBlur={field.onBlur}
                placeholder="Choose an account"
                options={accountOptions}
              />
            </FormField>
          )}
        />

        {isTransfer ? (
          <Controller
            control={form.control}
            name="toAccountId"
            render={({ field }) => (
              <FormField
                id="toAccountId"
                label="To account"
                description={
                  otherCurrencyCount > 0 && toAccounts.length === 0
                    ? `Transfers need another ${currency} account.`
                    : otherCurrencyCount > 0
                      ? `Only ${currency} accounts are shown: transfers keep one currency.`
                      : undefined
                }
                error={errors.toAccountId?.message}
                required
              >
                <SelectField
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={toAccounts.length > 0 ? "Choose an account" : "No matching account"}
                  disabled={toAccounts.length === 0}
                  options={toAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.name} · ${a.currency}`,
                  }))}
                />
              </FormField>
            )}
          />
        ) : (
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormField
                id="categoryId"
                label="Category"
                error={errors.categoryId?.message}
                required
              >
                <SelectField
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="Choose a category"
                  options={categories.map((c) => ({
                    value: c.id,
                    label: c.isArchived ? `${c.name} (archived)` : c.name,
                  }))}
                />
              </FormField>
            )}
          />
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="occurredOn" label="Date" error={errors.occurredOn?.message} required>
          <DateInput min={props.minDate} max={props.maxDate} {...form.register("occurredOn")} />
        </FormField>
        {!isTransfer && (
          <FormField
            id="payee"
            label={kind === "INCOME" ? "From (optional)" : "Paid to (optional)"}
            error={errors.payee?.message}
          >
            <Input
              autoComplete="off"
              maxLength={PAYEE_MAX}
              placeholder={kind === "INCOME" ? "e.g. Employer" : "e.g. Lucky Supermarket"}
              {...form.register("payee")}
            />
          </FormField>
        )}
      </div>

      <FormField id="note" label="Note (optional)" error={errors.note?.message}>
        <Textarea rows={2} maxLength={NOTE_MAX} {...form.register("note")} />
      </FormField>

      <FormAlert message={formError} />
      {/* DOM order puts "Save" first so Enter (implicit submission) uses it;
          row-reverse shows Cancel on the left on wider screens. */}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
        <Button type="submit" loading={isSubmitting}>
          {isSubmitting ? "Saving…" : editing ? "Save changes" : "Save"}
        </Button>
        {!editing && (
          <Button type="submit" variant="secondary" disabled={isSubmitting} data-intent="another">
            Save and add another
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
