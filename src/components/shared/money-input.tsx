import * as React from "react";

import { Input } from "@/components/ui/input";
import type { CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Text input for an amount, with the currency code as a visual prefix.
 * All props (id, aria-*, register()) go to the <input>, so it works as a
 * FormField child. Values stay strings; parse them with parseMoney.
 * `allowNegative` uses the full keyboard: phone number pads have no minus key.
 */
export function MoneyInput({
  currency,
  allowNegative = false,
  className,
  "aria-describedby": describedBy,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & {
  currency: CurrencyCode;
  allowNegative?: boolean;
}) {
  const currencyId = React.useId();
  return (
    <div className="relative">
      {/* Also announced: the field's description includes the currency (UX-13). */}
      <span
        id={currencyId}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground"
      >
        {currency}
      </span>
      <Input
        type="text"
        inputMode={allowNegative ? "text" : currency === "KHR" ? "numeric" : "decimal"}
        autoComplete="off"
        placeholder={currency === "KHR" ? "0" : "0.00"}
        className={cn("pl-12 amount", className)}
        aria-describedby={[currencyId, describedBy].filter(Boolean).join(" ")}
        {...props}
      />
    </div>
  );
}
