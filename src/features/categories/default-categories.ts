/**
 * Categories every new user starts with (docs/PRD.md §5.3). Created in the
 * same transaction as the user (registration) and by the local seed. Users can
 * rename, recolour, archive or add to them afterwards.
 * `color` values are chart token names, never raw colours.
 */
export interface DefaultCategory {
  name: string;
  type: "INCOME" | "EXPENSE";
  color: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "Salary", type: "INCOME", color: "chart-5" },
  { name: "Business income", type: "INCOME", color: "chart-2" },
  { name: "Freelance income", type: "INCOME", color: "chart-1" },
  { name: "Investment income", type: "INCOME", color: "chart-4" },
  { name: "Other income", type: "INCOME", color: "chart-6" },
  { name: "Food and drinks", type: "EXPENSE", color: "chart-3" },
  { name: "Transportation", type: "EXPENSE", color: "chart-1" },
  { name: "Housing and rent", type: "EXPENSE", color: "chart-2" },
  { name: "Utilities", type: "EXPENSE", color: "chart-6" },
  { name: "Shopping", type: "EXPENSE", color: "chart-4" },
  { name: "Health", type: "EXPENSE", color: "chart-5" },
  { name: "Entertainment", type: "EXPENSE", color: "chart-4" },
  { name: "Education", type: "EXPENSE", color: "chart-1" },
  { name: "Family", type: "EXPENSE", color: "chart-3" },
  { name: "Subscriptions", type: "EXPENSE", color: "chart-2" },
  { name: "Other expenses", type: "EXPENSE", color: "chart-6" },
];
