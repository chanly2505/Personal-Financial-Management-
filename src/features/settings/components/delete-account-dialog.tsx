"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  DELETE_CONFIRMATION,
  type DeleteAccountInput,
  deleteAccountSchema,
} from "@/features/auth/schemas";
import { applyActionErrors } from "@/lib/form-errors";

import { deleteAccountAction } from "../actions";

export interface DeletionSummary {
  label: string;
  count: number;
}

/**
 * Permanent account deletion: shows exactly what will be removed, offers a
 * download first, and requires the password and typing DELETE. Everything the
 * user owns is deleted in one database statement (cascading), and every
 * session ends because the user no longer exists.
 */
export function DeleteAccountDialog({ summary }: { summary: DeletionSummary[] }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: "", confirmation: "" as typeof DELETE_CONFIRMATION },
    mode: "onTouched",
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: DeleteAccountInput) {
    setFormError(null);
    const result = await deleteAccountAction(values);
    if (!result.ok) {
      form.resetField("password");
      setFormError(applyActionErrors(result, form.setError, ["password", "confirmation"]));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        setOpen(next);
        if (!next) {
          form.reset();
          setFormError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account…</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your sign-in and everything below. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          {summary.map((item) => (
            <li key={item.label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums">{item.count}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Want a copy first?{" "}
          <a
            href="/api/me/export"
            download
            className="font-medium underline underline-offset-4 hover:text-primary"
          >
            Download all your data
          </a>
          .
        </p>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <FormField id="delete-password" label="Your password" error={errors.password?.message}>
            <PasswordInput autoComplete="current-password" {...form.register("password")} />
          </FormField>
          <FormField
            id="delete-confirmation"
            label={`Type ${DELETE_CONFIRMATION} to confirm`}
            error={errors.confirmation?.message}
          >
            <Input
              autoComplete="off"
              autoCapitalize="characters"
              {...form.register("confirmation")}
            />
          </FormField>
          <FormAlert message={formError} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" loading={isSubmitting}>
              Delete permanently
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
