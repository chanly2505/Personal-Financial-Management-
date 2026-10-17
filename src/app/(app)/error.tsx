"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/**
 * Error boundary for every page inside the app shell. The shell (navigation)
 * stays usable; only the page content is replaced. Details stay out of the UI —
 * the server has already logged the error; `digest` lets support correlate it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side visibility for developers; contains no financial data.
    console.error("Page error", error.digest ?? error.name);
  }, [error]);

  return (
    <PageContainer>
      <ErrorState
        description={
          error.digest
            ? t("common.couldNotLoadPageRef", { reference: error.digest })
            : t("common.couldNotLoadPage")
        }
        action={
          <Button variant="outline" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {t("common.tryAgain")}
          </Button>
        }
      />
    </PageContainer>
  );
}
