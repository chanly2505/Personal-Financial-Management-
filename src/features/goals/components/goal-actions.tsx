"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { callAction } from "@/lib/action-result";
import { showError } from "@/lib/notify";

import {
  archiveGoalAction,
  deleteContributionAction,
  deleteGoalAction,
  restoreGoalAction,
} from "../actions";

/** Edit / archive / restore / delete for a goal. */
export function GoalActions({ goal }: { goal: { id: string; name: string; isArchived: boolean } }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  async function run(action: typeof archiveGoalAction, success: string, then?: string) {
    const result = await callAction(() => action({ id: goal.id }));
    if (!result.ok) return result.error;
    toast.success(success);
    if (then) router.push(then);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${goal.name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/goals/${goal.id}/edit`}>
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </DropdownMenuItem>
          {goal.isArchived ? (
            <DropdownMenuItem
              onSelect={() => void run(restoreGoalAction, "Goal restored").then(showError)}
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
        title={`Archive "${goal.name}"?`}
        description="It moves to Archived goals with its history. You can restore it later."
        confirmLabel="Archive"
        destructive={false}
        onConfirm={() => run(archiveGoalAction, "Goal archived")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete "${goal.name}"?`}
        description="The goal and its savings history are removed. Your account balances do not change. This cannot be undone."
        onConfirm={() => run(deleteGoalAction, "Goal deleted", "/goals")}
      />
    </>
  );
}

/** Remove one entry from a goal's history (with confirmation). */
export function RemoveContribution({
  goalId,
  contributionId,
  label,
}: {
  goalId: string;
  contributionId: string;
  label: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Remove ${label}`}>
          <X aria-hidden="true" />
        </Button>
      }
      title={`Remove ${label}?`}
      description="Only the goal's saved amount changes. Account balances are not affected."
      confirmLabel="Remove"
      onConfirm={async () => {
        const result = await callAction(() => deleteContributionAction({ goalId, contributionId }));
        if (!result.ok) return result.error;
        toast.success("Removed");
        router.refresh();
      }}
    />
  );
}
