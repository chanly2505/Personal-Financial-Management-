"use client";

import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";

import { signOutEverywhereAction } from "../actions";

export function SignOutEverywhere() {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline">Sign out everywhere</Button>}
      title="Sign out on all devices?"
      description="Every browser and device signed in to your account — including this one — will need to sign in again."
      confirmLabel="Sign out everywhere"
      destructive={false}
      onConfirm={async () => {
        // On success the action redirects to sign-in.
        const result = await signOutEverywhereAction();
        if (!result.ok) toast.error(result.error);
      }}
    />
  );
}
