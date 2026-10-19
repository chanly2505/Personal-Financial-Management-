"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/action-result";
import { showError } from "@/lib/notify";

import { archiveAccountAction, deleteAccountAction, restoreAccountAction } from "../actions";

/** Edit / archive / restore / delete controls on the account details page. */
export function AccountActions({
  account,
}: {
  account: { id: string; name: string; isArchived: boolean; hasHistory: boolean };
}) {
  const router = useRouter();

  async function archive() {
    const result = await callAction(() => archiveAccountAction({ id: account.id }));
    if (!result.ok) return result.error;
    toast.success("Account archived");
    router.refresh();
  }

  async function restore() {
    const result = await callAction(() => restoreAccountAction({ id: account.id }));
    if (!result.ok) return showError(result.error);
    toast.success("Account restored");
    router.refresh();
  }

  async function remove() {
    const result = await callAction(() => deleteAccountAction({ id: account.id }));
    if (!result.ok) return result.error;
    toast.success("Account deleted");
    router.push("/accounts");
    router.refresh();
  }

  return (
    <>
      {!account.isArchived && (
        <Button asChild variant="outline">
          <Link href={`/accounts/${account.id}/edit`}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
      )}
      {account.isArchived ? (
        <Button variant="outline" onClick={restore}>
          <ArchiveRestore aria-hidden="true" />
          Restore
        </Button>
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Archive aria-hidden="true" />
              Archive
            </Button>
          }
          title={`Archive "${account.name}"?`}
          description="It will be hidden from your account list, totals and pickers. All of its records are kept, and you can restore it at any time. The balance must be zero."
          confirmLabel="Archive"
          destructive={false}
          onConfirm={archive}
        />
      )}
      {!account.hasHistory && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          }
          title={`Delete "${account.name}"?`}
          description="This account has no records yet, so it can be removed completely. This cannot be undone."
          onConfirm={remove}
        />
      )}
    </>
  );
}
