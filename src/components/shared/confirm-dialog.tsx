"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

interface ConfirmDialogProps {
  /** Element that opens the dialog, e.g. a "Delete" button. Omit when controlled. */
  trigger?: React.ReactNode;
  /** Controlled mode (e.g. opened from a dropdown menu item). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Name the thing: "Delete 'Groceries – 12 Oct'?" */
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** May be async; the dialog stays open with a pending button until it settles. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmation for destructive or irreversible actions. Focus starts on
 * Cancel (Radix default for AlertDialog), Escape cancels, and the confirm
 * button shows a pending state while `onConfirm` runs.
 */
export function ConfirmDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = t("common.delete"),
  cancelLabel = t("common.cancel"),
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          {/* A plain Button (not AlertDialogAction) so the dialog stays open while pending. */}
          <Button
            variant={destructive ? "destructive" : "default"}
            loading={pending}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
