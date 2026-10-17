/**
 * English UI text (the only language for now). Khmer is added as km.ts with
 * the same shape — the `Messages` type makes a missing key a type error.
 * See docs/I18N.md for what lives here and how to add a language.
 */
export const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    tryAgain: "Try again",
    skipToContent: "Skip to content",
    loading: "Loading…",
    more: "More",
    moreDescription: "Other sections of the app",
    mainNavigation: "Main",
    accountMenu: "Account menu",
    notSignedIn: "Not signed in",
    unread: "(unread)",
    somethingWentWrong: "Something went wrong",
    couldNotLoad: "We couldn't load this right now. Please try again in a moment.",
    couldNotLoadPage: "We couldn't load this page. Please try again.",
    couldNotLoadPageRef: "We couldn't load this page. Please try again. (Reference: {reference})",
    pageNotFound: "We couldn't find that page",
    goToDashboard: "Go to dashboard",
  },
  nav: {
    dashboard: {
      label: "Dashboard",
      description: "Your balances, this month's spending and progress at a glance.",
    },
    transactions: {
      label: "Transactions",
      description: "Record and review money in, money out and transfers between your accounts.",
    },
    accounts: {
      label: "Accounts",
      description: "Cash, bank accounts and digital wallets, each with its current balance.",
    },
    budgets: {
      label: "Budgets",
      description: "Monthly spending limits for your categories and how much is left.",
    },
    categories: {
      label: "Categories",
      description: "The labels you use to group income and spending.",
    },
    recurring: {
      label: "Recurring",
      description: "Income and bills that repeat on a schedule and are recorded automatically.",
    },
    goals: {
      label: "Savings goals",
      description: "Targets you are saving toward and how close you are.",
    },
    reports: {
      label: "Reports",
      description: "Income and spending over any date range, by month and by category.",
    },
    settings: {
      label: "Settings",
      description: "Your profile, preferences, security and data.",
    },
  },
  settings: {
    sections: {
      profile: "Profile",
      preferences: "Region and display",
      notifications: "Notifications",
      security: "Security",
      data: "Your data",
      delete: "Delete account",
    },
    budgetAlerts: {
      ALL: {
        label: "Early warning and limit",
        description: "When a budget reaches its warning level (e.g. 80 %) and again at 100 %.",
      },
      LIMIT_ONLY: { label: "Only at the limit", description: "Once, when a budget is fully used." },
      OFF: { label: "Off", description: "No budget warnings. Budgets still show progress." },
    },
    currencyDisplay: {
      SYMBOL: "Symbols ($12.50, ៛41,000)",
      CODE: "Codes (USD 12.50, KHR 41,000)",
    },
  },
} as const;

/** The shape every language must provide (strings may differ, keys may not). */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof en>;
