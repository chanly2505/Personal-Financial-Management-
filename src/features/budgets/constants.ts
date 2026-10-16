/** Budget rules shared by forms, pages and the server (docs/PRD.md §6.7). */

/** Default warning threshold (% of the limit). Reaching 100 % always warns as well. */
export const DEFAULT_ALERT_THRESHOLD = 80;
export const MIN_ALERT_THRESHOLD = 1;
export const MAX_ALERT_THRESHOLD = 100;
export const ALERT_THRESHOLD_PRESETS = [50, 75, 80, 90, 100] as const;

/** Budgets are monthly. Months are written "YYYY-MM" in URLs and forms. */
export const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const MIN_MONTH = "2000-01";

/** Unread alerts listed in the header menu. */
export const ALERT_MENU_LIMIT = 8;
