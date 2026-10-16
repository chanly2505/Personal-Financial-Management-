import * as React from "react";

import { cn } from "@/lib/utils";

interface PageContainerProps {
  /** "page" for lists and dashboards, "content" for reading, "form" for single forms. */
  width?: "page" | "content" | "form";
  className?: string;
  children: React.ReactNode;
}

const widthClass = {
  page: "max-w-page",
  content: "max-w-content",
  form: "max-w-form",
} as const;

/** Consistent horizontal gutters, max width and vertical rhythm for every page. */
export function PageContainer({ width = "page", className, children }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:py-8",
        widthClass[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
