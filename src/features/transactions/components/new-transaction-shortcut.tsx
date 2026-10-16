"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keyboard shortcut: "n" opens the new-transaction form (ignored while typing). */
export function NewTransactionShortcut({ href = "/transactions/new" }: { href?: string }) {
  const router = useRouter();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "n" || event.metaKey || event.ctrlKey || event.altKey) return;
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
