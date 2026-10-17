import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * A chart with its title, a one-line definition of what it shows, and a table
 * view of the same numbers (the accessible equivalent; tooltips never gate data).
 */
export function ChartCard({
  title,
  description,
  table,
  action,
  children,
  className,
}: {
  title: string;
  description: string;
  /** The same data as a table. Omit when the chart already shows every value as text. */
  table?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  return (
    <Card className={className} aria-labelledby={`${id}-title`} role="region">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle id={`${id}-title`} className="text-base">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {children}
        {table && (
          <details className="group text-sm">
            <summary className="w-fit cursor-pointer rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              Show as table
            </summary>
            <div
              tabIndex={0}
              role="region"
              aria-label={`${title} as a table`}
              className="mt-3 max-h-80 overflow-auto rounded-lg border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {table}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

/** A compact data table for chart cards. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
        <tr>
          {columns.map((c, i) => (
            <th
              key={c}
              scope="col"
              className={i === 0 ? "px-3 py-2 font-medium" : "px-3 py-2 text-right font-medium"}
            >
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) =>
              i === 0 ? (
                <th key={i} scope="row" className="px-3 py-1.5 text-left font-normal">
                  {cell}
                </th>
              ) : (
                <td key={i} className="px-3 py-1.5 text-right tabular-nums">
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
