import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/features/auth/actions";
import { requirePageUser } from "@/server/auth/session";

/**
 * Every page in this group requires a verified session. This — not the
 * optimistic check in src/proxy.ts — is the authoritative page guard; data
 * access is additionally protected in each action, route handler and service.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  return (
    <AppShell user={{ name: user.name, email: user.email }} signOutAction={signOutAction}>
      {children}
    </AppShell>
  );
}
