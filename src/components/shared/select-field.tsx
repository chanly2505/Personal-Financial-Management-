"use client";

import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  contentClassName?: string;
  // Injected by FormField; forwarded to the trigger so the <label> and
  // descriptions are attached to the focusable element.
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

/**
 * A single-choice dropdown that works as a FormField child. (Radix's <Select>
 * root renders no element, so label/description props must go to the trigger.)
 */
export function SelectField({
  value,
  onValueChange,
  options,
  onBlur,
  disabled,
  placeholder,
  contentClassName,
  ...triggerProps
}: SelectFieldProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger onBlur={onBlur} {...triggerProps}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
