"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * App-wide toast host. Mounted once in the root layout; call `toast()` from
 * "sonner" anywhere in client code. Toasts confirm outcomes ("Expense added");
 * they never carry information the user must act on (use inline errors).
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      duration={4000}
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "!bg-popover !text-popover-foreground !border-border !shadow-md !rounded-lg",
          description: "!text-muted-foreground",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-destructive",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-info",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
