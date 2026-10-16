import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyTone = "neutral" | "income" | "expense" | "transfer";

interface MoneyProps {
  /** Amount in minor units (see src/lib/money.ts). */
  minor: bigint;
  currency: CurrencyCode;
  /**
   * income → "+$12.00" in the income colour; expense → "-$12.00" in the expense
   * colour; transfer → unsigned, neutral. `minor` is always the positive amount
   * for these tones. "neutral" (balances) shows the value as-is and colours
   * negatives as expense.
   */
  tone?: MoneyTone;
  className?: string;
}

const toneClass: Record<MoneyTone, string> = {
  neutral: "text-foreground",
  income: "text-income",
  expense: "text-expense",
  transfer: "text-transfer",
};

/** The only way monetary values are rendered. Exact formatting, tabular digits. */
export function Money({ minor, currency, tone = "neutral", className }: MoneyProps) {
  let value = minor;
  let signDisplay: "auto" | "always" = "auto";
  if (tone === "income") signDisplay = "always";
  if (tone === "expense") value = -minor;

  const negativeBalance = tone === "neutral" && minor < 0n;

  return (
    <span
      data-slot="money"
      className={cn("amount", negativeBalance ? "text-expense" : toneClass[tone], className)}
    >
      {formatMoney(value, currency, { signDisplay })}
    </span>
  );
}
