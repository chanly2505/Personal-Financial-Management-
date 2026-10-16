import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/features/auth/actions";
import { toAlertMenuItems } from "@/features/budgets/alert-items";
import { AlertsMenu } from "@/features/budgets/components/alerts-menu";
import { ALERT_MENU_LIMIT } from "@/features/budgets/constants";
import { getAlertsSummaryOrNull } from "@/features/budgets/server/service";
import { todayInTimeZone } from "@/lib/dates";
import { requirePageUser } from "@/server/auth/session";

/**
 * Every page in this group requires a verified session. This — not the
 * optimistic check in src/proxy.ts — is the authoritative page guard; data
 * access is additionally protected in each action, route handler and service.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  // In-app budget warnings for the header bell (two small indexed queries).
  // null if unavailable: the bell is hidden rather than breaking every page.
  const alerts = await getAlertsSummaryOrNull(user, ALERT_MENU_LIMIT);
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      signOutAction={signOutAction}
      notifications={
        alerts && (
          <AlertsMenu
            unread={alerts.unread}
            items={toAlertMenuItems(alerts.alerts, user.timezone, todayInTimeZone(user.timezone))}
          />
        )
      }
    >
      {children}
    </AppShell>
  );
}
