"use server";

import { revalidatePath } from "next/cache";

import { authedAction } from "@/server/auth/action";

import {
  type BudgetIdInput,
  type CopyBudgetsInput,
  type CreateBudgetInput,
  type MarkAlertsReadInput,
  type UpdateBudgetInput,
  budgetIdSchema,
  copyBudgetsSchema,
  createBudgetSchema,
  markAlertsReadSchema,
  updateBudgetSchema,
} from "./schemas";
import {
  archiveBudget,
  copyPreviousMonth,
  createBudget,
  deleteBudget,
  markAlertsRead,
  restoreBudget,
  updateBudget,
} from "./server/service";

/** Budget mutations. The owner is always the session user (authedAction). */

function refresh() {
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  // The alert count lives in the app header on every page.
  revalidatePath("/", "layout");
}

const runCreate = authedAction(createBudgetSchema, async (input, user) => {
  const result = await createBudget(user, input);
  refresh();
  return result;
});
export async function createBudgetAction(input: CreateBudgetInput) {
  return runCreate(input);
}

const runUpdate = authedAction(updateBudgetSchema, async (input, user) => {
  await updateBudget(user, input);
  refresh();
  return { id: input.id };
});
export async function updateBudgetAction(input: UpdateBudgetInput) {
  return runUpdate(input);
}

const runArchive = authedAction(budgetIdSchema, async ({ id }, user) => {
  await archiveBudget(user, id);
  refresh();
});
export async function archiveBudgetAction(input: BudgetIdInput) {
  return runArchive(input);
}

const runRestore = authedAction(budgetIdSchema, async ({ id }, user) => {
  await restoreBudget(user, id);
  refresh();
});
export async function restoreBudgetAction(input: BudgetIdInput) {
  return runRestore(input);
}

const runDelete = authedAction(budgetIdSchema, async ({ id }, user) => {
  await deleteBudget(user, id);
  refresh();
});
export async function deleteBudgetAction(input: BudgetIdInput) {
  return runDelete(input);
}

const runCopy = authedAction(copyBudgetsSchema, async ({ month }, user) => {
  const result = await copyPreviousMonth(user, month);
  refresh();
  return result;
});
export async function copyPreviousMonthAction(input: CopyBudgetsInput) {
  return runCopy(input);
}

const runMarkRead = authedAction(markAlertsReadSchema, async ({ ids }, user) => {
  const count = await markAlertsRead(user, ids);
  revalidatePath("/", "layout");
  return { count };
});
export async function markAlertsReadAction(input: MarkAlertsReadInput) {
  return runMarkRead(input);
}
