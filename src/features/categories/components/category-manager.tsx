"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { type ActionResult, callAction } from "@/lib/action-result";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { showError } from "@/lib/notify";

import { archiveCategoryAction, deleteCategoryAction, restoreCategoryAction } from "../actions";
import type { CategoryColor, CategoryType } from "../schemas";
import { COLOR_SWATCH, CategoryDialog } from "./category-dialog";

export interface CategoryItem {
  id: string;
  name: string;
  type: CategoryType;
  color: CategoryColor | null;
  isArchived: boolean;
  usageCount: number;
  transactionCount: number;
}

type DialogState =
  { mode: "create"; type: CategoryType } | { mode: "edit"; category: CategoryItem } | null;

/** Tabs per type, active and archived lists, and the add/edit dialog. */
export function CategoryManager({ categories }: { categories: CategoryItem[] }) {
  const [tab, setTab] = useState<CategoryType>("EXPENSE");
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryType)} className="gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="EXPENSE">Expenses</TabsTrigger>
            <TabsTrigger value="INCOME">Income</TabsTrigger>
          </TabsList>
          <Button onClick={() => setDialog({ mode: "create", type: tab })}>
            <Plus aria-hidden="true" />
            Add category
          </Button>
        </div>
        {(["EXPENSE", "INCOME"] as const).map((type) => (
          <TabsContent key={type} value={type} className="flex flex-col gap-5">
            <CategoryGroup
              type={type}
              categories={categories.filter((c) => c.type === type)}
              onAdd={() => setDialog({ mode: "create", type })}
              onEdit={(category) => setDialog({ mode: "edit", category })}
            />
          </TabsContent>
        ))}
      </Tabs>

      <CategoryDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        category={dialog?.mode === "edit" ? dialog.category : undefined}
        defaultType={dialog?.mode === "create" ? dialog.type : "EXPENSE"}
      />
    </>
  );
}

function CategoryGroup({
  type,
  categories,
  onAdd,
  onEdit,
}: {
  type: CategoryType;
  categories: CategoryItem[];
  onAdd: () => void;
  onEdit: (category: CategoryItem) => void;
}) {
  const active = categories.filter((c) => !c.isArchived);
  const archived = categories.filter((c) => c.isArchived);
  const noun = type === "INCOME" ? "income" : "expense";

  return (
    <>
      {active.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={`No ${noun} categories`}
          description={`Add a category to label your ${type === "INCOME" ? "money coming in" : "spending"}.`}
          action={<Button onClick={onAdd}>Add category</Button>}
        />
      ) : (
        <CategoryRows categories={active} onEdit={onEdit} />
      )}
      {archived.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={`Archived ${noun} categories`}>
          <h3 className="text-sm font-medium text-muted-foreground">
            Archived ({archived.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Kept on past records but can&apos;t be chosen for new ones.
          </p>
          <CategoryRows categories={archived} onEdit={onEdit} />
        </section>
      )}
    </>
  );
}

function CategoryRows({
  categories,
  onEdit,
}: {
  categories: CategoryItem[];
  onEdit: (category: CategoryItem) => void;
}) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {categories.map((category) => (
        <li key={category.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <span
            aria-hidden="true"
            className={cn(
              "size-3 shrink-0 rounded-full",
              category.color ? COLOR_SWATCH[category.color] : "bg-muted-foreground",
            )}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn("truncate font-medium", category.isArchived && "text-muted-foreground")}
            >
              {category.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {category.transactionCount === 0
                ? "Not used yet"
                : `${category.transactionCount} ${category.transactionCount === 1 ? "record" : "records"}`}
            </span>
          </div>
          {category.isArchived && <Badge variant="secondary">Archived</Badge>}
          <CategoryRowActions category={category} onEdit={() => onEdit(category)} />
        </li>
      ))}
    </ul>
  );
}

function CategoryRowActions({ category, onEdit }: { category: CategoryItem; onEdit: () => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  async function run(
    action: (input: { id: string }) => Promise<ActionResult<unknown>>,
    success: string,
  ) {
    const result = await callAction(() => action({ id: category.id }));
    if (!result.ok) return result.error;
    toast.success(success);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${category.name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          {category.isArchived ? (
            <DropdownMenuItem
              onSelect={() => void run(restoreCategoryAction, "Category restored").then(showError)}
            >
              <ArchiveRestore aria-hidden="true" />
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}>
              <Archive aria-hidden="true" />
              Archive
            </DropdownMenuItem>
          )}
          {category.usageCount === 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Archive "${category.name}"?`}
        description="Past records keep this category. It won't be offered for new records until you restore it."
        confirmLabel="Archive"
        destructive={false}
        onConfirm={() => run(archiveCategoryAction, "Category archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete "${category.name}"?`}
        description="It isn't used anywhere, so it can be removed completely. This cannot be undone."
        onConfirm={() => run(deleteCategoryAction, "Category deleted")}
      />
    </>
  );
}
