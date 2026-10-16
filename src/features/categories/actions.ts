"use server";

import { revalidatePath } from "next/cache";

import { authedAction } from "@/server/auth/action";

import {
  type CategoryIdInput,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  categoryIdSchema,
  createCategorySchema,
  updateCategorySchema,
} from "./schemas";
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  restoreCategory,
  updateCategory,
} from "./server/service";

/** Category mutations. The owner is always the session user (authedAction). */

const refresh = () => revalidatePath("/categories");

const runCreate = authedAction(createCategorySchema, async (input, user) => {
  const category = await createCategory(user, input);
  refresh();
  return category;
});
export async function createCategoryAction(input: CreateCategoryInput) {
  return runCreate(input);
}

const runUpdate = authedAction(updateCategorySchema, async (input, user) => {
  await updateCategory(user, input);
  refresh();
});
export async function updateCategoryAction(input: UpdateCategoryInput) {
  return runUpdate(input);
}

const runArchive = authedAction(categoryIdSchema, async ({ id }, user) => {
  await archiveCategory(user, id);
  refresh();
});
export async function archiveCategoryAction(input: CategoryIdInput) {
  return runArchive(input);
}

const runRestore = authedAction(categoryIdSchema, async ({ id }, user) => {
  await restoreCategory(user, id);
  refresh();
});
export async function restoreCategoryAction(input: CategoryIdInput) {
  return runRestore(input);
}

const runDelete = authedAction(categoryIdSchema, async ({ id }, user) => {
  await deleteCategory(user, id);
  refresh();
});
export async function deleteCategoryAction(input: CategoryIdInput) {
  return runDelete(input);
}
