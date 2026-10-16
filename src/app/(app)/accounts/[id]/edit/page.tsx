import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { AccountForm } from "@/features/accounts/components/account-form";
import { getAccount } from "@/features/accounts/server/service";
import { minorToDecimalString } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: PageProps<"/accounts/[id]/edit">) {
  const user = await requirePageUser();
  const { id } = await params;
  const account = await getAccount(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <PageContainer width="content">
      <PageHeader
        title="Edit account"
        breadcrumbs={[
          { label: "Accounts", href: "/accounts" },
          { label: account.name, href: `/accounts/${account.id}` },
          { label: "Edit" },
        ]}
      />
      <Card>
        <CardContent>
          <AccountForm
            mode="edit"
            accountId={account.id}
            hasHistory={account.referenceCount > 0}
            defaultValues={{
              name: account.name,
              type: account.type,
              currency: account.currency,
              openingBalance:
                account.openingBalanceMinor === 0n
                  ? ""
                  : minorToDecimalString(account.openingBalanceMinor, account.currency),
            }}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
