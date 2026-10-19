"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
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

import { deleteRecurringAction, pauseRecurringAction, resumeRecurringAction } from "../actions";
import type { RuleStatus } from "../types";

/** Edit, pause/resume and delete (with confirmation) for one rule. */
export function RuleActions({
  rule,
  afterDelete = "/recurring",
}: {
  rule: { id: string; name: string; status: RuleStatus };
  afterDelete?: string;
}) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: typeof pauseRecurringAction, success: string) {
    const result = await action({ id: rule.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(success);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${rule.name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/recurring/${rule.id}/edit`}>
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </DropdownMenuItem>
          {rule.status === "ACTIVE" && (
            <DropdownMenuItem onSelect={() => run(pauseRecurringAction, "Rule paused")}>
              <Pause aria-hidden="true" />
              Pause
            </DropdownMenuItem>
          )}
          {rule.status === "PAUSED" && (
            <DropdownMenuItem onSelect={() => run(resumeRecurringAction, "Rule resumed")}>
              <Play aria-hidden="true" />
              Resume
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${rule.name}"?`}
        description="No more transactions will be posted from it. Transactions it already posted stay in your history. This cannot be undone."
        onConfirm={async () => {
          const result = await callAction(() => deleteRecurringAction({ id: rule.id }));
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Recurring rule deleted");
          router.push(afterDelete);
          router.refresh();
        }}
      />
    </>
  );
}
