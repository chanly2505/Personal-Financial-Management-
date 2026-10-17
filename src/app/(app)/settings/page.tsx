import type { Metadata } from "next";
import { Download, FileJson } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/settings/components/change-password-form";
import { DeleteAccountDialog } from "@/features/settings/components/delete-account-dialog";
import { NotificationsForm } from "@/features/settings/components/notifications-form";
import { PreferencesForm } from "@/features/settings/components/preferences-form";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { SignOutEverywhere } from "@/features/settings/components/sign-out-everywhere";
import { getRecordCounts, getSettings } from "@/features/settings/server/service";
import { EXPORT_MAX_ROWS } from "@/features/transactions/constants";
import { timeZoneChoices, todayInTimeZone } from "@/lib/dates";
import { formatInstant } from "@/lib/format/dates";
import { formatInteger } from "@/lib/format/number";
import { requirePageUser } from "@/server/auth/session";
import { t } from "@/i18n";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "profile", label: t("settings.sections.profile") },
  { id: "preferences", label: t("settings.sections.preferences") },
  { id: "notifications", label: t("settings.sections.notifications") },
  { id: "security", label: t("settings.sections.security") },
  { id: "data", label: t("settings.sections.data") },
  { id: "delete", label: t("settings.sections.delete") },
] as const;

function Section({
  id,
  title,
  description,
  children,
  danger = false,
}: {
  id: (typeof SECTIONS)[number]["id"];
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card
      id={id}
      aria-labelledby={`${id}-title`}
      role="region"
      className={danger ? "scroll-mt-20 border-destructive/40" : "scroll-mt-20"}
    >
      <CardHeader>
        <h2 id={`${id}-title`} className="text-lg leading-none font-semibold">
          {title}
        </h2>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [settings, counts] = await Promise.all([getSettings(user.id), getRecordCounts(user.id)]);
  const timezones = [...timeZoneChoices()];
  if (!timezones.includes(settings.timezone)) timezones.unshift(settings.timezone);
  const when = (date: Date) => formatInstant(date, settings.timezone);

  return (
    <PageContainer>
      <PageHeader title={t("nav.settings.label")} description={t("nav.settings.description")} />

      <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto px-1">
        <ul className="flex w-max gap-1 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="block rounded-md px-3 py-1.5 whitespace-nowrap text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section
        id="profile"
        title={t("settings.sections.profile")}
        description="Your name and sign-in email."
      >
        <ProfileForm email={settings.email} defaultValues={{ name: settings.name ?? "" }} />
      </Section>

      <Section
        id="preferences"
        title={t("settings.sections.preferences")}
        description="How amounts and dates look, and which day it is for you. Your records are never converted or changed."
      >
        <PreferencesForm
          timezones={timezones}
          today={todayInTimeZone(settings.timezone)}
          defaultValues={{
            baseCurrency: settings.baseCurrency,
            timezone: settings.timezone,
            dateFormat: settings.dateFormat,
            numberFormat: settings.numberFormat,
            currencyDisplay: settings.currencyDisplay,
          }}
        />
      </Section>

      <Section
        id="notifications"
        title={t("settings.sections.notifications")}
        description="Choose which budget warnings you see in the app."
      >
        <NotificationsForm
          defaultValues={{
            budgetAlertMode: settings.budgetAlertMode,
            defaultAlertThreshold: settings.defaultAlertThreshold,
          }}
        />
      </Section>

      <Section
        id="security"
        title={t("settings.sections.security")}
        description={`Password last changed ${when(settings.passwordChangedAt)}. Member since ${when(settings.createdAt)}.`}
      >
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Change password</h3>
            <p className="text-sm text-muted-foreground">
              Enter your current password to set a new one. You&apos;ll then sign in again on every
              device.
            </p>
            <ChangePasswordForm />
          </div>
          <div className="flex flex-col gap-3 border-t pt-6">
            <h3 className="text-base font-semibold">Sessions</h3>
            <p className="text-sm text-muted-foreground">
              Signed in somewhere you don&apos;t recognise, or on a shared computer? Sign out of
              every device at once.
            </p>
            <SignOutEverywhere />
          </div>
        </div>
      </Section>

      <Section
        id="data"
        title={t("settings.sections.data")}
        description="Download a copy of your records at any time."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-start gap-2 rounded-lg border p-4">
            <h3 className="font-medium">Transactions (CSV)</h3>
            <p className="text-sm text-muted-foreground">
              Opens in Excel or Google Sheets. Up to {formatInteger(EXPORT_MAX_ROWS)} records; use
              the Transactions or Reports page to export a filtered list.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="/api/transactions/export?sort=date_asc" download>
                <Download aria-hidden="true" />
                Download CSV
              </a>
            </Button>
          </div>
          <div className="flex flex-col items-start gap-2 rounded-lg border p-4">
            <h3 className="font-medium">Everything (JSON)</h3>
            <p className="text-sm text-muted-foreground">
              Accounts, categories, transactions, transfers, budgets, recurring items and goals in
              one file — a full copy you can keep or move elsewhere.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href="/api/me/export" download>
                <FileJson aria-hidden="true" />
                Download all data
              </a>
            </Button>
          </div>
        </div>
      </Section>

      <Section
        id="delete"
        title={t("settings.sections.delete")}
        danger
        description="Permanently remove your account and every record in it. This cannot be undone."
      >
        <DeleteAccountDialog
          summary={[
            { label: "Accounts", count: counts.accounts },
            { label: "Transactions", count: counts.transactions },
            { label: "Transfers", count: counts.transfers },
            { label: "Categories", count: counts.categories },
            { label: "Budgets", count: counts.budgets },
            { label: "Recurring items", count: counts.recurringRules },
            { label: "Savings goals", count: counts.savingsGoals },
          ]}
        />
      </Section>
    </PageContainer>
  );
}
