import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/settings/components/change-password-form";
import { DeleteAccountDialog } from "@/features/settings/components/delete-account-dialog";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { SignOutEverywhere } from "@/features/settings/components/sign-out-everywhere";
import { getProfile } from "@/features/settings/server/service";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Settings" };

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function SettingsPage() {
  const user = await requirePageUser();
  const profile = await getProfile(user.id);
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(profile.timezone)) timezones.unshift(profile.timezone);

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Your profile, preferences and account security." />

      <Card>
        <CardHeader>
          <CardTitle>Profile and preferences</CardTitle>
          <CardDescription>How your name, currency and dates appear.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            email={profile.email}
            timezones={timezones}
            defaultValues={{
              name: profile.name ?? "",
              baseCurrency: profile.baseCurrency,
              timezone: profile.timezone,
              exchangeRateKhrPerUsd: profile.exchangeRateKhrPerUsd,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Last changed {dateFormat.format(profile.passwordChangedAt)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Signed in somewhere you don&apos;t recognise, or on a shared computer? Sign out of every
            device at once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutEverywhere />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Permanently remove your account and every record in it. Member since{" "}
            {dateFormat.format(profile.createdAt)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
