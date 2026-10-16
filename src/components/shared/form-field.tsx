import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  /** Must match the `id` of the control passed as the child. */
  id: string;
  label: string;
  /** Short help shown under the label. */
  description?: string;
  /** Validation message; also marks the control invalid. */
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}

/**
 * Label + control + help + error, wired for assistive technology:
 * the control receives `aria-describedby` and `aria-invalid` automatically.
 * Works with any single control child (Input, Textarea, DateInput, SelectTrigger).
 */
export function FormField({
  id,
  label,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  } as React.HTMLAttributes<HTMLElement>);

  return (
    <div data-slot="form-field" className={cn("grid gap-2", className)}>
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {/* Visual marker only: the control itself carries aria-required. Kept outside
            the <label> so the accessible name is exactly the label text. */}
        {required && (
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {description && (
        <p id={descriptionId} className="-mt-1 text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {control}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
