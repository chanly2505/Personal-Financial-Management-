"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { callAction } from "@/lib/action-result";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showError } from "@/lib/notify";

import { archiveBudgetAction, deleteBudgetAction, restoreBudgetAction } from "../actions";

/** Per-budget menu: edit, archive or restore, delete (with confirmation). */
export function BudgetActions({
  budget,
}: {
  budget: { id: string; label: string; isArchived: boolean };
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  async function run(action: typeof archiveBudgetAction, success: string) {
    const result = await callAction(() => action({ id: budget.id }));
    if (!result.ok) return result.error;
    toast.success(success);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${budget.label}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!budget.isArchived && (
            <DropdownMenuItem asChild>
              <Link href={`/budgets/${budget.id}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </DropdownMenuItem>
          )}
          {budget.isArchived ? (
            <DropdownMenuItem
              onSelect={() => void run(restoreBudgetAction, "Budget restored").then(showError)}
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
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Archive the ${budget.label} budget?`}
        description="It is hidden from this month and stops warning you. Your expenses are not affected, and you can restore it later."
        confirmLabel="Archive"
        destructive={false}
        onConfirm={() => run(archiveBudgetAction, "Budget archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete the ${budget.label} budget?`}
        description="The budget and its warnings are removed. Your expenses are not affected. This cannot be undone."
        onConfirm={() => run(deleteBudgetAction, "Budget deleted")}
      />
    </>
  );
}
