"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { MoneyInput } from "@/components/shared/money-input";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import type { IsoDate } from "@/lib/dates";
import { type CurrencyCode, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { addContributionAction } from "../actions";
import { CONTRIBUTION_NOTE_MAX } from "../constants";

/**
 * Set money aside for a goal, or take some back. Earmarks only — account
 * balances do not change. One request id per entry, so a double submit records once.
 */
export function ContributionForm({
  goalId,
  currency,
  today,
  canWithdraw,
}: {
  goalId: string;
  currency: CurrencyCode;
  today: IsoDate;
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState<string>(today);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseMoney(amount, currency);
    if (!parsed.ok) {
      setErrors({ amount: parsed.error });
      return;
    }
    setErrors({});
    setPending(true);
    const result = await addContributionAction({
      goalId,
      kind,
      amount,
      occurredOn,
      note,
      clientRequestId: requestId,
    });
    setPending(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setFormError(
        result.fieldErrors && Object.keys(result.fieldErrors).length > 0 ? null : result.error,
      );
      return;
    }
    toast.success(kind === "DEPOSIT" ? "Money set aside" : "Money taken back");
    setAmount("");
    setNote("");
    setRequestId(crypto.randomUUID());
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Update savings">
      <fieldset>
        <legend className="sr-only">Type</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["DEPOSIT", "Set aside"],
              ["WITHDRAWAL", "Take back"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "relative flex h-9 items-center justify-center rounded-md text-sm font-medium",
                "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                kind === value
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
                value === "WITHDRAWAL" && !canWithdraw
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                disabled={value === "WITHDRAWAL" && !canWithdraw}
                onChange={() => setKind(value)}
                className="absolute inset-0 cursor-[inherit] appearance-none rounded-md opacity-0"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="contribution-amount" label="Amount" error={errors.amount} required>
          <MoneyInput
            currency={currency}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>
        <FormField id="contribution-date" label="Date" error={errors.occurredOn} required>
          <DateInput
            max={today}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </FormField>
      </div>
      <FormField id="contribution-note" label="Note (optional)" error={errors.note}>
        <Input
          maxLength={CONTRIBUTION_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
      <FormAlert message={formError} />
      <Button type="submit" loading={pending} className="self-start">
        {kind === "DEPOSIT" ? "Set aside" : "Take back"}
      </Button>
    </form>
  );
}
