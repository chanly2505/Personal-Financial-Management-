"use server";

import { revalidatePath } from "next/cache";

import { authedAction } from "@/server/auth/action";

import {
  type CreateRecurringInput,
  type RecurringIdInput,
  type UpdateRecurringInput,
  createRecurringSchema,
  recurringIdSchema,
  updateRecurringSchema,
} from "./schemas";
import {
  createRecurring,
  deleteRecurring,
  pauseRecurring,
  resumeRecurring,
  updateRecurring,
} from "./server/service";

/** Recurring rule mutations. Rules never post here; only the scheduled engine posts. */

function refresh() {
  revalidatePath("/recurring", "layout");
}

const runCreate = authedAction(createRecurringSchema, async (input, user) => {
  const result = await createRecurring(user, input);
  refresh();
  return result;
});
export async function createRecurringAction(input: CreateRecurringInput) {
  return runCreate(input);
}

const runUpdate = authedAction(updateRecurringSchema, async (input, user) => {
  await updateRecurring(user, input);
  refresh();
  return { id: input.id };
});
export async function updateRecurringAction(input: UpdateRecurringInput) {
  return runUpdate(input);
}

const runPause = authedAction(recurringIdSchema, async ({ id }, user) => {
  await pauseRecurring(user, id);
  refresh();
});
export async function pauseRecurringAction(input: RecurringIdInput) {
  return runPause(input);
}

const runResume = authedAction(recurringIdSchema, async ({ id }, user) => {
  await resumeRecurring(user, id);
  refresh();
});
export async function resumeRecurringAction(input: RecurringIdInput) {
  return runResume(input);
}

const runDelete = authedAction(recurringIdSchema, async ({ id }, user) => {
  await deleteRecurring(user, id);
  // Posted transactions lose their rule link.
  revalidatePath("/", "layout");
});
export async function deleteRecurringAction(input: RecurringIdInput) {
  return runDelete(input);
}
