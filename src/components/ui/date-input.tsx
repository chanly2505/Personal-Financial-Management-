import * as React from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Date picker for calendar dates (YYYY-MM-DD).
 *
 * Deliberately built on the native `<input type="date">`: it gives every
 * platform its own accessible, localised picker (including the mobile wheel /
 * calendar sheets), needs no extra dependency, and its value is already an ISO
 * calendar date — exactly what financial dates are (see docs/PRD.md §6.5).
 */
function DateInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <div className="relative w-full">
      <input
        type="date"
        data-slot="date-input"
        className={cn(
          "h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-card py-1 pr-9 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          // Hide the browser's own icon; ours is decorative and the whole field opens the picker.
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-auto [&::-webkit-calendar-picker-indicator]:w-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
          className,
        )}
        {...props}
      />
      <CalendarDays
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { DateInput };
