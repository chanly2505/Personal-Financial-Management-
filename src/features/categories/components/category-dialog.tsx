"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/shared/form-alert";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { applyActionErrors } from "@/lib/form-errors";
import { cn } from "@/lib/utils";
import { callAction } from "@/lib/action-result";

import { createCategoryAction, updateCategoryAction } from "../actions";
import {
  CATEGORY_COLORS,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPES,
  type CategoryColor,
  type CategoryType,
  type CreateCategoryInput,
  createCategorySchema,
} from "../schemas";

/** Background classes per token; listed literally so Tailwind generates them. */
export const COLOR_SWATCH: Record<CategoryColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
  "chart-6": "bg-chart-6",
};

const COLOR_NAMES: Record<CategoryColor, string> = {
  "chart-1": "Blue",
  "chart-2": "Teal",
  "chart-3": "Amber",
  "chart-4": "Pink",
  "chart-5": "Green",
  "chart-6": "Grey",
};

export interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = create. */
  category?: {
    id: string;
    name: string;
    type: CategoryType;
    color: CategoryColor | null;
    usageCount: number;
  };
  defaultType?: CategoryType;
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  defaultType = "EXPENSE",
}: CategoryDialogProps) {
  const router = useRouter();
  const editing = Boolean(category);
  const typeLocked = editing && (category?.usageCount ?? 0) > 0;
  const [formError, setFormError] = useState<string | null>(null);
  const initial: CreateCategoryInput = {
    name: category?.name ?? "",
    type: category?.type ?? defaultType,
    color: category?.color ?? "chart-1",
  };
  const form = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    values: initial,
    mode: "onTouched",
  });
  /** Every opening starts fresh: no text or errors left over from the last time. */
  function close() {
    setFormError(null);
    form.reset(initial);
    onOpenChange(false);
  }
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: CreateCategoryInput) {
    setFormError(null);
    const result = category
      ? await callAction(() => updateCategoryAction({ ...values, id: category.id }))
      : await callAction(() => createCategoryAction(values));
    if (!result.ok) {
      setFormError(applyActionErrors(result, form.setError, ["name", "type", "color"]));
      return;
    }
    toast.success(editing ? "Category updated" : "Category added");
    close();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply everywhere this category is used, including past records."
              : "Use categories to group your income and spending."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-5">
          <FormField id="category-name" label="Name" error={errors.name?.message} required>
            <Input autoComplete="off" placeholder="e.g. Coffee" {...form.register("name")} />
          </FormField>

          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <fieldset
                className="grid gap-2"
                aria-describedby={typeLocked ? "type-locked" : undefined}
              >
                <legend className="mb-2 text-sm font-medium">Type</legend>
                <div role="radiogroup" className="grid grid-cols-2 gap-2">
                  {CATEGORY_TYPES.map((type) => (
                    <label
                      key={type}
                      className={cn(
                        "relative flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                        typeLocked && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <input
                        type="radio"
                        className="absolute inset-0 cursor-pointer appearance-none rounded-[inherit] opacity-0 disabled:cursor-not-allowed"
                        name={field.name}
                        value={type}
                        checked={field.value === type}
                        onChange={() => field.onChange(type)}
                        disabled={typeLocked}
                      />
                      {type === "INCOME" ? "Money in (income)" : "Money out (expense)"}
                    </label>
                  ))}
                </div>
                {typeLocked && (
                  <p id="type-locked" className="text-xs text-muted-foreground">
                    Already used, so it stays {CATEGORY_TYPE_LABELS[category!.type].toLowerCase()}.
                  </p>
                )}
                {errors.type?.message && (
                  <p className="text-sm text-destructive">{errors.type.message}</p>
                )}
              </fieldset>
            )}
          />

          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Colour</legend>
                <div role="radiogroup" className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((color) => (
                    <label
                      key={color}
                      className="relative flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-transparent has-[:checked]:border-foreground has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                    >
                      <input
                        type="radio"
                        className="absolute inset-0 cursor-pointer appearance-none rounded-[inherit] opacity-0 disabled:cursor-not-allowed"
                        name={field.name}
                        value={color}
                        checked={field.value === color}
                        onChange={() => field.onChange(color)}
                        aria-label={COLOR_NAMES[color]}
                      />
                      <span
                        className={cn("size-6 rounded-full", COLOR_SWATCH[color])}
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          />

          <FormAlert message={formError} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={isSubmitting}>
              {editing ? "Save changes" : "Add category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
