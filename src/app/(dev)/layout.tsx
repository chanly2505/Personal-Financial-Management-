import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/features/auth/actions";
import { getCurrentUser } from "@/server/auth/session";

// Developer-only pages. Kept outside (app) so there is no loading boundary:
// notFound() then returns a real 404 status instead of a streamed 200.
// No sign-in required: these pages show static samples, never user data.
export default async function DevLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <AppShell
      user={user ? { name: user.name, email: user.email } : undefined}
      signOutAction={user ? signOutAction : undefined}
    >
      {children}
    </AppShell>
  );
}
