import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountList } from "@/features/accounts/components/account-list";
import { getAccountsOverview } from "@/features/accounts/server/service";
import { CURRENCIES } from "@/lib/money";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  const user = await requirePageUser();
  const { active, archived, totals } = await getAccountsOverview(user);

  const addButton = (
    <Button asChild>
      <Link href="/accounts/new">
        <Plus aria-hidden="true" />
        Add account
      </Link>
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Accounts"
        description="Cash, bank accounts and digital wallets, each with its current balance."
        actions={active.length > 0 || archived.length > 0 ? addButton : undefined}
      />

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Add your first account"
          description="Add the places you keep money — cash, a bank account like ABA or ACLEDA, or a wallet like Wing."
          action={addButton}
        />
      ) : (
        <>
          {totals.length > 0 && (
            <section aria-labelledby="totals-heading" className="flex flex-col gap-3">
              <h2 id="totals-heading" className="sr-only">
                Totals by currency
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {totals.map((total) => (
                  <Card key={total.currency} className="gap-2">
                    <CardHeader>
                      <CardDescription>
                        Total in {CURRENCIES[total.currency].label.replace(/ \(.*\)$/, "")}
                      </CardDescription>
                      <CardTitle className="text-2xl sm:text-3xl">
                        <Money minor={total.balanceMinor} currency={total.currency} />
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {total.accountCount} active{" "}
                        {total.accountCount === 1 ? "account" : "accounts"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              {totals.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Totals are kept separate for each currency and are never converted.
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="active-heading" className="flex flex-col gap-3">
            <h2 id="active-heading" className="text-lg font-semibold">
              Active accounts
            </h2>
            {active.length > 0 ? (
              <AccountList accounts={active} />
            ) : (
              <EmptyState
                title="No active accounts"
                description="All of your accounts are archived. Add a new one or restore an archived account."
              />
            )}
          </section>

          {archived.length > 0 && (
            <details className="group flex flex-col gap-3">
              <summary className="cursor-pointer rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                Archived accounts ({archived.length})
              </summary>
              <p className="mt-2 mb-3 text-xs text-muted-foreground">
                Hidden from totals and pickers. Their records are kept.
              </p>
              <AccountList accounts={archived} />
            </details>
          )}
        </>
      )}
    </PageContainer>
  );
}
