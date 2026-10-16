"use server";

import { revalidatePath } from "next/cache";

import { authedAction } from "@/server/auth/action";

import {
  type AddContributionInput,
  type CreateGoalInput,
  type DeleteContributionInput,
  type GoalIdInput,
  type UpdateGoalInput,
  addContributionSchema,
  createGoalSchema,
  deleteContributionSchema,
  goalIdSchema,
  updateGoalSchema,
} from "./schemas";
import {
  addContribution,
  archiveGoal,
  createGoal,
  deleteContribution,
  deleteGoal,
  restoreGoal,
  updateGoal,
} from "./server/service";

/** Goal mutations. Earmarks only: nothing here changes an account balance. */

function refresh() {
  revalidatePath("/goals", "layout");
  revalidatePath("/dashboard");
}

const runCreate = authedAction(createGoalSchema, async (input, user) => {
  const result = await createGoal(user, input);
  refresh();
  return result;
});
export async function createGoalAction(input: CreateGoalInput) {
  return runCreate(input);
}

const runUpdate = authedAction(updateGoalSchema, async (input, user) => {
  await updateGoal(user, input);
  refresh();
  return { id: input.id };
});
export async function updateGoalAction(input: UpdateGoalInput) {
  return runUpdate(input);
}

const runArchive = authedAction(goalIdSchema, async ({ id }, user) => {
  await archiveGoal(user, id);
  refresh();
});
export async function archiveGoalAction(input: GoalIdInput) {
  return runArchive(input);
}

const runRestore = authedAction(goalIdSchema, async ({ id }, user) => {
  await restoreGoal(user, id);
  refresh();
});
export async function restoreGoalAction(input: GoalIdInput) {
  return runRestore(input);
}

const runDelete = authedAction(goalIdSchema, async ({ id }, user) => {
  await deleteGoal(user, id);
  refresh();
});
export async function deleteGoalAction(input: GoalIdInput) {
  return runDelete(input);
}

const runAdd = authedAction(addContributionSchema, async (input, user) => {
  const result = await addContribution(user, input);
  refresh();
  return result;
});
export async function addContributionAction(input: AddContributionInput) {
  return runAdd(input);
}

const runRemove = authedAction(deleteContributionSchema, async (input, user) => {
  await deleteContribution(user, input);
  refresh();
});
export async function deleteContributionAction(input: DeleteContributionInput) {
  return runRemove(input);
}
