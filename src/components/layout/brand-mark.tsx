import { cn } from "@/lib/utils";

/** Small square logo mark. Decorative: always paired with the app name (visible or sr-only). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      PF
    </span>
  );
}
