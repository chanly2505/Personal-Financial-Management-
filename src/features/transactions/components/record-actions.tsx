"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

import { deleteRecordAction, reverseTransferAction } from "../actions";

/** Edit / delete (and reverse, for transfers) on a record's details page. */
export function RecordActions({
  record,
}: {
  record: {
    id: string;
    label: string;
    isTransfer: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canReverse: boolean;
    deleteHint?: string;
  };
}) {
  const router = useRouter();
  // One id per page visit: repeating the confirm never creates two reversals.
  const [reverseRequestId] = useState(() => crypto.randomUUID());

  async function remove() {
    const result = await deleteRecordAction({ id: record.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(record.isTransfer ? "Transfer deleted" : "Transaction deleted");
    router.push("/transactions");
    router.refresh();
  }

  async function reverse() {
    const result = await reverseTransferAction({
      id: record.id,
      clientRequestId: reverseRequestId,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Transfer reversed");
    router.push(`/transactions/${result.data.id}`);
    router.refresh();
  }

  return (
    <>
      {record.canEdit && (
        <Button asChild variant="outline">
          <Link href={`/transactions/${record.id}/edit`}>
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        </Button>
      )}
      {record.canReverse && (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Undo2 aria-hidden="true" />
              Reverse
            </Button>
          }
          title="Reverse this transfer?"
          description="This records a new transfer that moves the same amount back, dated today (or on the transfer's own date if that is later). The original stays in your history, linked to the reversal."
          confirmLabel="Reverse transfer"
          destructive={false}
          onConfirm={reverse}
        />
      )}
      {record.canDelete && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          }
          title={`Delete "${record.label}"?`}
          description={
            record.isTransfer
              ? "Both accounts go back to their balances without this transfer. This cannot be undone."
              : "The account balance is recalculated without it. This cannot be undone."
          }
          onConfirm={remove}
        />
      )}
      {record.deleteHint && (
        <p className="basis-full text-xs text-muted-foreground">{record.deleteHint}</p>
      )}
    </>
  );
}
