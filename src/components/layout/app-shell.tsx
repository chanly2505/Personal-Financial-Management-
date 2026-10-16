import * as React from "react";

import type { AccountMenuUser } from "./account-menu";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";

/**
 * Application frame. The (app) layout passes the verified user; the
 * developer-only (dev) layout may render it without one.
 *   < md   header + content + bottom navigation
 *   md     icon rail + header + content
 *   lg+    full sidebar + header + content
 */
export function AppShell({
  children,
  user,
  signOutAction,
  notifications,
}: {
  children: React.ReactNode;
  user?: AccountMenuUser;
  signOutAction?: () => Promise<void>;
  notifications?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="flex min-h-dvh flex-col md:pl-rail lg:pl-sidebar">
        <AppHeader user={user} signOutAction={signOutAction} notifications={notifications} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 pb-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] outline-none md:pb-0"
        >
          {children}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
