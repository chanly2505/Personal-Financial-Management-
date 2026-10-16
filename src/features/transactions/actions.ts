"use server";

import { revalidatePath } from "next/cache";

import { authedAction } from "@/server/auth/action";

import {
  type CreateEntryInput,
  type CreateTransferInput,
  type RecordIdInput,
  type ReverseTransferInput,
  type UpdateEntryInput,
  type UpdateTransferInput,
  createEntrySchema,
  createTransferSchema,
  recordIdSchema,
  reverseTransferSchema,
  updateEntrySchema,
  updateTransferSchema,
} from "./schemas";
import {
  createEntry,
  createTransfer,
  deleteEntry,
  deleteTransfer,
  getRecord,
  reverseTransfer,
  updateEntry,
  updateTransfer,
} from "./server/service";

/**
 * Ledger mutations. The owner is always the session user (authedAction); ids
 * from the client are only ever looked up within that user's records.
 * Balances, budgets and warnings are derived, so every change refreshes them too.
 */

function refresh() {
  // Balances, the dashboard, budgets and the header's budget warnings all
  // derive from the ledger, so refresh the whole signed-in area.
  revalidatePath("/", "layout");
}

const runCreateEntry = authedAction(createEntrySchema, async (input, user) => {
  const result = await createEntry(user, input);
  refresh();
  return result;
});
export async function createEntryAction(input: CreateEntryInput) {
  return runCreateEntry(input);
}

const runUpdateEntry = authedAction(updateEntrySchema, async (input, user) => {
  await updateEntry(user, input);
  refresh();
  return { id: input.id };
});
export async function updateEntryAction(input: UpdateEntryInput) {
  return runUpdateEntry(input);
}

const runCreateTransfer = authedAction(createTransferSchema, async (input, user) => {
  const result = await createTransfer(user, input);
  refresh();
  return result;
});
export async function createTransferAction(input: CreateTransferInput) {
  return runCreateTransfer(input);
}

const runUpdateTransfer = authedAction(updateTransferSchema, async (input, user) => {
  await updateTransfer(user, input);
  refresh();
  return { id: input.id };
});
export async function updateTransferAction(input: UpdateTransferInput) {
  return runUpdateTransfer(input);
}

/** Deletes an income, expense or transfer by id. */
const runDelete = authedAction(recordIdSchema, async ({ id }, user) => {
  const record = await getRecord(user, id);
  if (record.kind === "TRANSFER") await deleteTransfer(user, id);
  else await deleteEntry(user, id);
  refresh();
});
export async function deleteRecordAction(input: RecordIdInput) {
  return runDelete(input);
}

const runReverse = authedAction(reverseTransferSchema, async (input, user) => {
  const result = await reverseTransfer(user, input);
  refresh();
  return result;
});
export async function reverseTransferAction(input: ReverseTransferInput) {
  return runReverse(input);
}
