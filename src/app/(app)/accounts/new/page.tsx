import type { Metadata } from "next";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AccountForm } from "@/features/accounts/components/account-form";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Add account" };

export default async function NewAccountPage() {
  await requirePageUser();
  return (
    <PageContainer width="content">
      <PageHeader
        title="Add account"
        description="Somewhere you keep money. Each account holds one currency."
        breadcrumbs={[{ label: "Accounts", href: "/accounts" }, { label: "Add account" }]}
      />
      <Card>
        <CardContent>
          <AccountForm mode="create" />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
