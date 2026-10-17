import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RuleActions } from "@/features/recurring/components/rule-actions";
import {
  MAX_ATTEMPTS,
  PAUSE_REASON_LABELS,
  RUN_REASON_LABELS,
  STATUS_LABELS,
} from "@/features/recurring/constants";
import { occurrencesBetween } from "@/features/recurring/schedule";
import { getRecurring } from "@/features/recurring/server/service";
import { addDays, formatCalendarDate, todayInTimeZone } from "@/lib/dates";
import { getCurrentUser, requirePageUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";

/** The tab title is the record's name, like the page heading (falls back when not found). */
export async function generateMetadata({
  params,
}: PageProps<"/recurring/[id]">): Promise<Metadata> {
  const [user, { id }] = await Promise.all([getCurrentUser(), params]);
  const rule = user
    ? await getRecurring(user, id)
        .then((r) => r.rule)
        .catch(() => null)
    : null;
  return { title: rule?.name ?? "Recurring transaction" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export default async function RecurringDetailPage({ params }: PageProps<"/recurring/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  const { rule, runs } = await getRecurring(user, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const today = todayInTimeZone(user.timezone);
  const upcoming =
    rule.status === "ACTIVE" && rule.nextOccurrenceOn
      ? occurrencesBetween(
          {
            frequency: rule.frequency,
            interval: rule.interval,
            startOn: rule.startOn,
            endOn: rule.endOn,
          },
          rule.nextOccurrenceOn,
          addDays(today, 400),
          5,
        )
      : [];

  return (
    <PageContainer width="content">
      <PageHeader
        title={rule.name}
        breadcrumbs={[{ label: "Recurring", href: "/recurring" }, { label: rule.name }]}
        actions={<RuleActions rule={{ id: rule.id, name: rule.name, status: rule.status }} />}
      />

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Recurring rule</Badge>
            <Badge variant={rule.status === "PAUSED" ? "warning" : "secondary"}>
              {STATUS_LABELS[rule.status]}
            </Badge>
          </div>
          <CardTitle className="text-3xl">
            <Money
              minor={rule.amountMinor}
              currency={rule.currency}
              tone={rule.type === "INCOME" ? "income" : "expense"}
            />
          </CardTitle>
          <CardDescription>{rule.scheduleText}</CardDescription>
          {rule.status === "PAUSED" && rule.pauseReason && (
            <p className="text-sm text-warning">
              {PAUSE_REASON_LABELS[rule.pauseReason]}. Nothing is posted while paused; dates during
              the pause are skipped when you resume.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Account">
              {rule.account.name}
              {rule.account.isArchived && " (archived)"}
            </Row>
            <Row label="Category">
              {rule.category.name}
              {rule.category.isArchived && " (archived)"}
            </Row>
            {rule.payee && (
              <Row label={rule.type === "INCOME" ? "From" : "Paid to"}>{rule.payee}</Row>
            )}
            <Row label="Starts">{formatCalendarDate(rule.startOn)}</Row>
            <Row label="Ends">{rule.endOn ? formatCalendarDate(rule.endOn) : "No end date"}</Row>
            {rule.description && <Row label="Note">{rule.description}</Row>}
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="next-heading" className="flex flex-col gap-2">
        <h2 id="next-heading" className="text-lg font-semibold">
          Upcoming dates
        </h2>
        <p className="text-sm text-muted-foreground">Scheduled, not posted yet.</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rule.status === "COMPLETED"
              ? "No more dates: this rule has finished."
              : "None while paused."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label="Upcoming dates">
            {upcoming.map((d) => (
              <li key={d} className="rounded-md border border-dashed bg-card px-3 py-1.5 text-sm">
                {formatCalendarDate(d, today)}
                {d <= today && <span className="text-muted-foreground"> · due</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing posted yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card" aria-label="Execution history">
            {runs.map((run) => (
              <li key={run.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                {run.status === "POSTED" ? (
                  <CheckCircle2 className="mt-0.5 size-4 text-income" aria-hidden="true" />
                ) : run.status === "FAILED" ? (
                  <XCircle className="mt-0.5 size-4 text-destructive" aria-hidden="true" />
                ) : (
                  <MinusCircle className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">
                    {formatCalendarDate(run.occurrenceOn, today)} ·{" "}
                    {run.status === "POSTED"
                      ? "Posted"
                      : run.status === "FAILED"
                        ? "Failed"
                        : "Skipped"}
                  </span>
                  {run.status !== "POSTED" && (
                    <span className="text-xs text-muted-foreground">
                      {RUN_REASON_LABELS[run.reason ?? ""] ?? "A problem occurred"}
                      {run.status === "FAILED" &&
                        (rule.status === "ACTIVE"
                          ? ` · attempt ${run.attempts} of ${MAX_ATTEMPTS}, retried on the next run`
                          : ` · ${run.attempts} attempts`)}
                    </span>
                  )}
                </span>
                {run.status === "POSTED" && run.transactionId && (
                  <Link
                    href={`/transactions/${run.transactionId}`}
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    View transaction
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
