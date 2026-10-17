"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

import { type ThemePreference, applyTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { setThemeAction } from "../theme-action";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}[] = [
  {
    value: "system",
    label: "Same as this device",
    description: "Light or dark, following your device's setting.",
    icon: Monitor,
  },
  { value: "light", label: "Light", description: "Dark text on a light background.", icon: Sun },
  { value: "dark", label: "Dark", description: "Light text on a dark background.", icon: Moon },
];

/**
 * Colour theme for this browser. Applies immediately — no Save button — and is
 * remembered in a cookie for later visits (src/lib/theme.ts).
 */
export function AppearanceForm({ defaultValue }: { defaultValue: ThemePreference }) {
  const [theme, setTheme] = useState(defaultValue);

  async function choose(value: ThemePreference) {
    const previous = theme;
    setTheme(value);
    applyTheme(value);
    const result = await setThemeAction(value).catch(() => ({ ok: false }));
    if (!result.ok) {
      setTheme(previous);
      applyTheme(previous);
      toast.error("We couldn't save your theme. Please try again.");
    }
  }

  return (
    <fieldset className="grid gap-2 sm:grid-cols-3" aria-describedby="theme-hint">
      <legend className="mb-1 text-sm font-medium">Theme</legend>
      <p id="theme-hint" className="text-sm text-muted-foreground sm:col-span-3">
        Changes straight away. Saved for this browser only.
      </p>
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
            theme === option.value && "border-primary bg-primary/5",
          )}
        >
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => void choose(option.value)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <option.icon aria-hidden="true" className="size-4" />
              {option.label}
            </span>
            <span className="text-sm text-muted-foreground">{option.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
