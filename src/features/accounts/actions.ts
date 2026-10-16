"use server";

import { revalidatePath } from "next/cache";

import { authedAction } from "@/server/auth/action";

import {
  type AccountIdInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  accountIdSchema,
  createAccountSchema,
  updateAccountSchema,
} from "./schemas";
import {
  archiveAccount,
  createAccount,
  deleteAccount,
  restoreAccount,
  updateAccount,
} from "./server/service";

/** Account mutations. The owner is always the session user (authedAction). */

function refresh(id?: string) {
  revalidatePath("/accounts");
  if (id) revalidatePath(`/accounts/${id}`);
}

const runCreate = authedAction(createAccountSchema, async (input, user) => {
  const account = await createAccount(user, input);
  refresh();
  return account;
});
export async function createAccountAction(input: CreateAccountInput) {
  return runCreate(input);
}

const runUpdate = authedAction(updateAccountSchema, async (input, user) => {
  await updateAccount(user, input);
  refresh(input.id);
  return { id: input.id };
});
export async function updateAccountAction(input: UpdateAccountInput) {
  return runUpdate(input);
}

const runArchive = authedAction(accountIdSchema, async ({ id }, user) => {
  await archiveAccount(user, id);
  refresh(id);
});
export async function archiveAccountAction(input: AccountIdInput) {
  return runArchive(input);
}

const runRestore = authedAction(accountIdSchema, async ({ id }, user) => {
  await restoreAccount(user, id);
  refresh(id);
});
export async function restoreAccountAction(input: AccountIdInput) {
  return runRestore(input);
}

const runDelete = authedAction(accountIdSchema, async ({ id }, user) => {
  await deleteAccount(user, id);
  refresh();
});
export async function deleteAccountAction(input: AccountIdInput) {
  return runDelete(input);
}
