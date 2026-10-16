"use client";

import "./globals.css";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it renders its own <html> and avoids app components that
 * might be the cause of the failure.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-background p-6 font-sans text-foreground">
        <main role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            The app couldn&apos;t load. Please try again.
            {error.digest && ` (Reference: ${error.digest})`}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 h-9 cursor-pointer rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
