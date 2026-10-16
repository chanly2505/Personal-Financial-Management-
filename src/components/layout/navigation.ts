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
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Your balances, this month's spending and progress at a glance.",
    phase: 5,
    primaryOnMobile: true,
  },
  {
    href: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    description: "Record and review money in, money out and transfers between your accounts.",
    phase: 4,
    primaryOnMobile: true,
  },
  {
    href: "/accounts",
    label: "Accounts",
    icon: Wallet,
    description: "Cash, bank accounts and digital wallets, each with its current balance.",
    phase: 3,
    primaryOnMobile: true,
  },
  {
    href: "/budgets",
    label: "Budgets",
    icon: PiggyBank,
    description: "Monthly spending limits for your categories and how much is left.",
    phase: 6,
    primaryOnMobile: true,
  },
  {
    href: "/categories",
    label: "Categories",
    icon: Tags,
    description: "The labels you use to group income and spending.",
    phase: 3,
  },
  {
    href: "/recurring",
    label: "Recurring",
    icon: Repeat,
    description: "Income and bills that repeat on a schedule and are recorded automatically.",
    phase: 7,
  },
  {
    href: "/goals",
    label: "Savings goals",
    icon: Target,
    description: "Targets you are saving toward and how close you are.",
    phase: 8,
  },
  {
    href: "/reports",
    label: "Reports",
    icon: BarChart3,
    description: "Income and spending over any date range, by month and by category.",
    phase: 9,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    description: "Your profile, currency, timezone and security preferences.",
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
