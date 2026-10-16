import "server-only";

import type { CurrentUser } from "@/server/auth/session";
import { normalizeName } from "@/lib/utils";
import { NotFoundError, ValidationError } from "@/server/errors";

import type { CategoryColor, CategoryType } from "../schemas";
import * as repo from "./repository";

/**
 * Category rules (docs/PRD.md §5.3, §6.1, §6.10):
 * - every category is either income or expense; names are unique per user and
 *   type, case-insensitively;
 * - the type can change only while nothing uses the category (the database
 *   also blocks it via composite foreign keys with ON UPDATE NO ACTION);
 * - archiving is always allowed: past records keep their category and meaning,
 *   but archived categories cannot be chosen for new records;
 * - deleting is only possible while nothing uses the category.
 */

export interface CategorySummary {
  id: string;
  name: string;
  type: CategoryType;
  color: CategoryColor | null;
  isArchived: boolean;
  archivedAt: Date | null;
  /** Transactions, recurring rules and budgets that use the category. */
  usageCount: number;
  transactionCount: number;
}

type Row = NonNullable<Awaited<ReturnType<typeof repo.findCategory>>>;

function toSummary(row: Row): CategorySummary {
  const { transactions, recurringRules, budgets } = row._count;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: (row.color as CategoryColor | null) ?? null,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt,
    usageCount: transactions + recurringRules + budgets,
    transactionCount: transactions,
  };
}

const NOT_FOUND = "We couldn't find that category.";

export async function listCategories(user: Pick<CurrentUser, "id">): Promise<CategorySummary[]> {
  return (await repo.listCategories(user.id)).map(toSummary);
}

async function getOwned(userId: string, id: string): Promise<CategorySummary> {
  const row = await repo.findCategory(userId, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return toSummary(row);
}

async function assertNameAvailable(
  userId: string,
  type: CategoryType,
  name: string,
  excludeId?: string,
) {
  const existing = await repo.findCategoryByName(userId, type, name, excludeId);
  if (!existing) return;
  const label = type === "INCOME" ? "income" : "expense";
  const message = existing.isArchived
    ? `An archived ${label} category already has this name. Restore it instead.`
    : `You already have an ${label} category with this name.`;
  throw new ValidationError(message, { name: message });
}

export async function createCategory(
  user: Pick<CurrentUser, "id">,
  input: { name: string; type: CategoryType; color: CategoryColor },
): Promise<{ id: string }> {
  const name = normalizeName(input.name);
  await assertNameAvailable(user.id, input.type, name);
  return repo.createCategory(user.id, { name, type: input.type, color: input.color });
}

export async function updateCategory(
  user: Pick<CurrentUser, "id">,
  input: { id: string; name: string; type: CategoryType; color: CategoryColor },
): Promise<void> {
  const existing = await getOwned(user.id, input.id);
  if (input.type !== existing.type && existing.usageCount > 0) {
    const message =
      "This category is already used, so it can't switch between income and expense. Create a new category instead.";
    throw new ValidationError(message, { type: message });
  }
  const name = normalizeName(input.name);
  await assertNameAvailable(user.id, input.type, name, input.id);
  const changed = await repo.updateCategory(user.id, input.id, {
    name,
    type: input.type,
    color: input.color,
  });
  if (changed === 0) throw new NotFoundError(NOT_FOUND);
}

export async function archiveCategory(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const category = await getOwned(user.id, id);
  if (category.isArchived) return;
  await repo.setArchived(user.id, id, true);
}

export async function restoreCategory(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const category = await getOwned(user.id, id);
  if (!category.isArchived) return;
  await repo.setArchived(user.id, id, false);
}

export async function deleteCategory(user: Pick<CurrentUser, "id">, id: string): Promise<void> {
  const category = await getOwned(user.id, id);
  if (category.usageCount > 0) {
    throw new ValidationError(
      "This category is in use, so it can't be deleted. Archive it instead — past records keep it.",
    );
  }
  await repo.deleteCategory(user.id, id);
}

/** Active categories of one type, for pickers on income/expense forms. */
export function listSelectableCategories(user: Pick<CurrentUser, "id">, type: CategoryType) {
  return repo.listActiveByType(user.id, type);
}

/**
 * For other modules: confirm a category can be used for a new record of `type`.
 * Wrong type and archived categories are validation errors; another user's
 * category is "not found" (its existence is not revealed).
 */
export async function assertCategoryUsable(
  user: Pick<CurrentUser, "id">,
  categoryId: string,
  type: CategoryType,
): Promise<void> {
  const category = await getOwned(user.id, categoryId);
  if (category.type !== type) {
    const message =
      type === "INCOME"
        ? "Choose an income category for money coming in."
        : "Choose an expense category for money going out.";
    throw new ValidationError(message, { categoryId: message });
  }
  if (category.isArchived) {
    const message = "This category is archived. Choose another, or restore it first.";
    throw new ValidationError(message, { categoryId: message });
  }
}
