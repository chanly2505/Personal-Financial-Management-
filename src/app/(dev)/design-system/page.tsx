import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Info, Inbox, Plus, Wallet } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { FormField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { env } from "@/server/env";

import { InteractiveDemos } from "./interactive-demos";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

// Evaluate the ENABLE_DESIGN_SYSTEM_PAGE gate per request, not once at build time.
export const dynamic = "force-dynamic";

/**
 * Living reference for docs/UI_GUIDELINES.md. Development tool only: hidden
 * in production unless ENABLE_DESIGN_SYSTEM_PAGE=true. Sample values below are
 * illustrative strings for rendering, not stored data.
 */
export default function DesignSystemPage() {
  if (env.NODE_ENV === "production" && !env.ENABLE_DESIGN_SYSTEM_PAGE) notFound();

  return (
    <PageContainer>
      <PageHeader
        title="Design system"
        description="Tokens and components with their variants and states. Reference for building features."
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Design system" }]}
      />

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map(([name, className]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className={`h-12 rounded-lg border ${className}`} />
              <code className="text-xs text-muted-foreground">{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <p className="text-2xl font-semibold tracking-tight">Page title — text-2xl semibold</p>
          <p className="text-lg font-semibold">Section title — text-lg semibold</p>
          <p className="text-base font-semibold">Card title — text-base semibold</p>
          <p className="text-sm">Body — text-sm. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-xs text-muted-foreground">Caption — text-xs muted</p>
          <p className="text-3xl font-semibold amount">
            <Money minor={1234567n} currency="USD" />
          </p>
        </div>
      </Section>

      <Section title="Amounts">
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
          <Money minor={125000n} currency="USD" tone="income" />
          <Money minor={4250n} currency="USD" tone="expense" />
          <Money minor={410000n} currency="KHR" tone="transfer" />
          <Money minor={-2500n} currency="USD" />
          <Money minor={82000n} currency="KHR" />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Delete</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button>
            <Plus aria-hidden="true" />
            With icon
          </Button>
          <Button size="icon" variant="outline" aria-label="Add">
            <Plus aria-hidden="true" />
          </Button>
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-6 md:grid-cols-2">
          <FormField id="ds-name" label="Account name" description="Shown in lists and reports.">
            <Input placeholder="e.g. ABA Savings" />
          </FormField>
          <FormField
            id="ds-amount"
            label="Amount"
            error="Enter an amount greater than zero."
            required
          >
            <Input inputMode="decimal" defaultValue="0" autoComplete="off" />
          </FormField>
          <FormField id="ds-date" label="Date">
            <DateInput defaultValue="2026-10-16" />
          </FormField>
          <FormField
            id="ds-disabled"
            label="Currency"
            description="Cannot be changed after creation."
          >
            <Input defaultValue="USD" disabled />
          </FormField>
          <FormField id="ds-note" label="Note" className="md:col-span-2">
            <Textarea placeholder="Optional details" />
          </FormField>
        </div>
      </Section>

      <InteractiveDemos />

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="income">Income</Badge>
          <Badge variant="expense">Expense</Badge>
          <Badge variant="transfer">Transfer</Badge>
          <Badge variant="success">Achieved</Badge>
          <Badge variant="warning">Almost at limit</Badge>
          <Badge variant="danger">Over limit</Badge>
          <Badge variant="info">
            <Info aria-hidden="true" />
            Info
          </Badge>
        </div>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Approximate total</AlertTitle>
            <AlertDescription>Combined totals use your own exchange rate.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>Your changes were saved.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Almost at your limit</AlertTitle>
            <AlertDescription>You have used 85% of this budget.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t save</AlertTitle>
            <AlertDescription>Please check the highlighted fields.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Cards and table">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Sample card</CardDescription>
              <CardTitle className="text-2xl amount">
                <Money minor={250000n} currency="USD" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Supporting detail</CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>16 Oct 2026</TableCell>
                    <TableCell>Sample row</TableCell>
                    <TableCell className="text-right">
                      <Money minor={1250n} currency="USD" tone="expense" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>15 Oct 2026</TableCell>
                    <TableCell>Sample row</TableCell>
                    <TableCell className="text-right">
                      <Money minor={200000n} currency="KHR" tone="income" />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Loading, empty and error states">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add the places you keep money to see your balances."
            action={<Button>Add account</Button>}
          />
          <ErrorState action={<Button variant="outline">Try again</Button>} />
        </div>
        <EmptyState
          icon={Inbox}
          title="Nothing here"
          description="Minimal variant without an action."
        />
      </Section>
    </PageContainer>
  );
}

const SWATCHES: [string, string][] = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["muted", "bg-muted"],
  ["border", "bg-border"],
  ["foreground", "bg-foreground"],
  ["muted-foreground", "bg-muted-foreground"],
  ["primary", "bg-primary"],
  ["secondary", "bg-secondary"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["destructive", "bg-destructive"],
  ["info", "bg-info"],
  ["income", "bg-income"],
  ["expense", "bg-expense"],
  ["transfer", "bg-transfer"],
  ["chart-1", "bg-chart-1"],
  ["chart-2", "bg-chart-2"],
  ["chart-3", "bg-chart-3"],
  ["chart-4", "bg-chart-4"],
  ["chart-5", "bg-chart-5"],
  ["chart-6", "bg-chart-6"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
