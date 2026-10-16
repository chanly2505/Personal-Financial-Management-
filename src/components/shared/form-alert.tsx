import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** Form-level message above the submit button (server errors, confirmations). */
export function FormAlert({
  message,
  variant = "destructive",
}: {
  message?: string | null;
  variant?: "destructive" | "success" | "info";
}) {
  if (!message) return null;
  const Icon = variant === "destructive" ? AlertCircle : CheckCircle2;
  return (
    <Alert variant={variant}>
      <Icon aria-hidden="true" />
      <AlertDescription className="text-current">{message}</AlertDescription>
    </Alert>
  );
}
