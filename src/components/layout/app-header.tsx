import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { APP_NAME } from "@/lib/config";

import { AccountMenu, type AccountMenuUser } from "./account-menu";
import { BrandMark } from "./brand-mark";

/** Sticky top bar: brand on phones, account menu for the signed-in user. */
export function AppHeader({
  user,
  signOutAction,
}: {
  user?: AccountMenuUser;
  signOutAction?: () => Promise<void>;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-header items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:hidden"
      >
        <BrandMark className="size-7 text-xs" />
        <span className="font-semibold tracking-tight">{APP_NAME}</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {user && signOutAction ? (
          <AccountMenu user={user} signOutAction={signOutAction} />
        ) : (
          <Badge variant="outline">Not signed in</Badge>
        )}
      </div>
    </header>
  );
}
