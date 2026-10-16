import { z } from "zod";

export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
};

/** Chart tokens (docs/UI_GUIDELINES.md §2). Also enforced by a CHECK constraint. */
export const CATEGORY_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_NAME_MAX = 40;

const nameSchema = z
  .string({ error: "Enter a name." })
  .trim()
  .min(1, "Enter a name.")
  .max(CATEGORY_NAME_MAX, `Use at most ${CATEGORY_NAME_MAX} characters.`);

const idSchema = z.uuid({ error: "That item could not be found." });

export const createCategorySchema = z.object({
  name: nameSchema,
  type: z.enum(CATEGORY_TYPES, { error: "Choose income or expense." }),
  color: z.enum(CATEGORY_COLORS, { error: "Choose a colour." }),
});
export type CreateCategoryInput = z.input<typeof createCategorySchema>;

/** Type may change only while the category has never been used (checked by the service). */
export const updateCategorySchema = createCategorySchema.extend({ id: idSchema });
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

export const categoryIdSchema = z.object({ id: idSchema });
export type CategoryIdInput = z.input<typeof categoryIdSchema>;
