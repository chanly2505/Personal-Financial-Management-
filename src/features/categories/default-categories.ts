/**
 * Categories every new user starts with (docs/PRD.md §5.3). Pure data: used by
 * the local seed now and by registration in the authentication phase.
 * `color` values are chart token names, never raw colours.
 */
export interface DefaultCategory {
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Salary", type: "INCOME", color: "chart-5" },
  { name: "Business", type: "INCOME", color: "chart-2" },
  { name: "Gifts received", type: "INCOME", color: "chart-4" },
  { name: "Other income", type: "INCOME", color: "chart-6" },
  { name: "Food & drinks", type: "EXPENSE", color: "chart-3" },
  { name: "Transport", type: "EXPENSE", color: "chart-1" },
  { name: "Housing & utilities", type: "EXPENSE", color: "chart-2" },
  { name: "Phone & internet", type: "EXPENSE", color: "chart-4" },
  { name: "Shopping", type: "EXPENSE", color: "chart-5" },
  { name: "Health", type: "EXPENSE", color: "chart-1" },
  { name: "Education", type: "EXPENSE", color: "chart-3" },
  { name: "Family & gifts", type: "EXPENSE", color: "chart-4" },
  { name: "Fees & charges", type: "EXPENSE", color: "chart-6" },
  { name: "Other expenses", type: "EXPENSE", color: "chart-6" },
];
