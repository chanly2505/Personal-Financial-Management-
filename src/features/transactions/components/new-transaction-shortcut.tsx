"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keyboard shortcut: Alt+N (Option+N on a Mac) opens the new-transaction form.
 * A modifier is required so speech input or a stray key press never navigates
 * (WCAG 2.1.4, UX-12). Ignored while typing or in dialogs.
 */
export function NewTransactionShortcut({ href = "/transactions/new" }: { href?: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // event.code, not event.key: Option+N on a Mac types "˜".
      if (event.code !== "KeyN" || !event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog], [role=listbox]",
        )
      )
        return;
      event.preventDefault();
      router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, href]);
  return null;
}
