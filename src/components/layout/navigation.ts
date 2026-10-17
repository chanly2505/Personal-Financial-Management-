import {
  ArrowLeftRight,
  BarChart3,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  Settings,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { t } from "@/i18n";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One-line description used for page headers and placeholders. */
  description: string;
  /** Delivery phase in docs/IMPLEMENTATION_PLAN.md. */
  phase: number;
  /** Shown in the phone bottom bar (max 4; the rest go under "More"). */
  primaryOnMobile?: boolean;
}

/** Single source of truth for the app's modules, in navigation order. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: t("nav.dashboard.label"),
    icon: LayoutDashboard,
    description: t("nav.dashboard.description"),
    phase: 5,
    primaryOnMobile: true,
  },
  {
    href: "/transactions",
    label: t("nav.transactions.label"),
    icon: ArrowLeftRight,
    description: t("nav.transactions.description"),
    phase: 4,
    primaryOnMobile: true,
  },
  {
    href: "/accounts",
    label: t("nav.accounts.label"),
    icon: Wallet,
    description: t("nav.accounts.description"),
    phase: 3,
    primaryOnMobile: true,
  },
  {
    href: "/budgets",
    label: t("nav.budgets.label"),
    icon: PiggyBank,
    description: t("nav.budgets.description"),
    phase: 6,
    primaryOnMobile: true,
  },
  {
    href: "/categories",
    label: t("nav.categories.label"),
    icon: Tags,
    description: t("nav.categories.description"),
    phase: 3,
  },
  {
    href: "/recurring",
    label: t("nav.recurring.label"),
    icon: Repeat,
    description: t("nav.recurring.description"),
    phase: 7,
  },
  {
    href: "/goals",
    label: t("nav.goals.label"),
    icon: Target,
    description: t("nav.goals.description"),
    phase: 8,
  },
  {
    href: "/reports",
    label: t("nav.reports.label"),
    icon: BarChart3,
    description: t("nav.reports.description"),
    phase: 9,
  },
  {
    href: "/settings",
    label: t("nav.settings.label"),
    icon: Settings,
    description: t("nav.settings.description"),
    phase: 2,
  },
];

export function getNavItem(href: string): NavItem {
  const item = NAV_ITEMS.find((i) => i.href === href);
  if (!item) throw new Error(`Unknown navigation item: ${href}`);
  return item;
}

/** True when `pathname` is the item's page or one of its sub-pages. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
