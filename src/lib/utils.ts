import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, letting later classes override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Trim and collapse internal whitespace, so "  ABA   Bank " and "ABA Bank" compare equal. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
