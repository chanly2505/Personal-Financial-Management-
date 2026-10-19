"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/action-result";

import { copyPreviousMonthAction } from "../actions";

export function CopyMonthButton({ month, count }: { month: string; count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const result = await callAction(() => copyPreviousMonthAction({ month }));
        setPending(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(
          result.data.created === 1 ? "Copied 1 budget" : `Copied ${result.data.created} budgets`,
        );
        router.refresh();
      }}
    >
      <Copy aria-hidden="true" />
      Copy {count} from last month
    </Button>
  );
}
