import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { APP_NAME } from "@/lib/config";

/** Centered, distraction-free frame for sign-in, registration and recovery. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10 sm:px-6">
      <header>
        <Link
          href="/"
          className="mb-8 flex items-center gap-2 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <BrandMark />
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
      </header>
      <main className="w-full max-w-sm">{children}</main>
      <footer className="mt-8 text-sm text-muted-foreground">
        <Link
          href="/privacy"
          className="rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Privacy
        </Link>
      </footer>
    </div>
  );
}
