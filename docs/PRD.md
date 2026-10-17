# Product Requirements — Personal Finance Management System

| | |
|---|---|
| Status | Phase 3 complete (accounts & categories) |
| Related | [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [SECURITY](SECURITY.md) · [UI_GUIDELINES](UI_GUIDELINES.md) · [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) |

Decision markers used in this document:
- **[D-n] Decided** — a default chosen for a minor matter; may be changed later at low cost.
- **[Q-n] Needs approval** — affects financial correctness or scope; the proposed default is used for planning only and is **not** implemented until approved. All are collected in §9.

## 1. Problem

People who earn and spend in more than one currency (in Cambodia, US dollars and riel side by side) and keep money in several places (cash, bank accounts, digital wallets) have no single trustworthy view of where their money is, where it goes, and whether they are on track. Spreadsheets drift, bank apps show one account at a time, and generic apps count moving money between your own accounts as spending.

## 2. Users

| Persona | Needs |
|---|---|
| **Salaried individual** (primary) | Log daily spending on a phone in seconds, see the month at a glance, stay within a few category budgets. |
| **Freelancer / small trader** | Irregular income in USD and KHR, several wallets, monthly and category reports, CSV for an accountant. |
| **Saver** | Track progress toward goals (emergency fund, motorbike, tuition). |

All users are non-technical. The UI uses plain language; no accounting jargon ("debit/credit", "ledger", "journal").

## 3. Scope

### In scope (v1)

1. User authentication and profile management.
2. Income, expenses and transfers.
3. Cash, bank and digital wallet accounts.
4. Custom income and expense categories.
5. Account balances and transaction history.
6. Monthly budgets and spending limits.
7. Recurring income and expenses.
8. Savings goals.
9. Financial dashboard and analytics.
10. Date-range reports and CSV export.
11. USD and KHR.
12. Responsive desktop, tablet and mobile interfaces.

### Out of scope (v1)

- Direct bank, wallet or card integrations; automatic transaction import. The app never asks for or stores bank passwords, PINs, card numbers or payment credentials.
- Payment processing of any kind (the app records money; it never moves it).
- AI or automated financial advice, recommendations or predictions.
- CSV **import** (export only; import boundaries are defined in §6.11 for a later version).
- Credit cards, loans and other liabilities as account types (see Q-13).
- Investments, multi-user/household ledgers, tax calculations.
- Live exchange-rate feeds (see §6.4).
- Native mobile apps.

## 4. Glossary

| Term | Definition |
|---|---|
| **Account** | A place where the user keeps money: cash, bank, digital wallet (e.g. ABA, Wing), other. One currency for its whole life. |
| **Income** | Money entering one of the user's accounts from outside the user's set of accounts. |
| **Expense** | Money leaving one of the user's accounts to outside the user's set of accounts. |
| **Transfer** | Money moving between two of the user's own accounts. |
| **Category** | A label for income or for expenses (never both). |
| **Budget** | A monthly spending limit for one expense category in one currency. |
| **Recurring rule** | A schedule that creates income or expense entries automatically. |
| **Savings goal** | A target amount the user is setting money aside for. |
| **Contribution** | An amount set aside for (or taken back from) a goal. |
| **Base currency** | The user's preferred currency for approximate combined totals. |

## 5. Functional requirements

"Must" items are part of the module's definition of done.

### 5.1 Authentication & profile
- Must: register with email + password; sign in; sign out; sign out of all devices.
- Must: passwords stored only as slow salted hashes; length 10–128; error messages never reveal whether an email is registered.
- Must: every page except landing, sign-in and register requires a session.
- Must: sign-in and registration are rate limited.
- Must: profile — name, email (read-only in v1), base currency, timezone, KHR-per-USD display rate.
- Must: change password (signs out other sessions).
- Must: delete my account and all data, with typed confirmation.
- Should: password reset by email — implemented; enabled per environment once an email provider is configured (Q-12).
- New users receive a default set of categories and are guided to create their first account.

### 5.2 Accounts
- Must: create, rename, archive/restore; choose type (cash, bank, digital wallet, other) and currency; set an opening balance. The create form offers starting points (Cash, ABA Bank, ACLEDA Bank, Wing) but any name is allowed; names are unique per user, ignoring case and extra spaces.
- Must: show current balance (derived, §6.2) and transaction history per account.
- Must: currency cannot be changed after creation.
- Must: an account with any history cannot be deleted, only archived (§6.10). Totals are shown per currency and never combined.

### 5.3 Categories
- Must: default categories seeded per user — income: Salary, Business income, Freelance income, Investment income, Other income; expense: Food and drinks, Transportation, Housing and rent, Utilities, Shopping, Health, Entertainment, Education, Family, Subscriptions, Other expenses.
- Must: create, rename, recolour (fixed palette), archive and restore; delete only while unused.
- Must: every category is income **or** expense; an income record can only use an income category and vice versa (service check + composite foreign key).
- Must: the type cannot change once the category is used; archiving keeps it on past records but removes it from pickers.

### 5.4 Transactions & transfers
- Must: create, edit and delete income, expenses and transfers.
- Must: history list with filters — date range, account, category, type, text search — and pagination.
- Must: amounts validated per currency (§6.3); date defaults to today in the user's timezone (§6.5).
- Must: delete asks for confirmation.
- Must: transfers move money between two different accounts of the **same currency** (v1; see §6.1). Cross-currency transfers (amount sent ≠ amount received) are deferred.
- Must: a transfer can be **reversed** (a linked opposite transfer dated today) instead of edited after the fact.
- Must: a double submission of the same form creates one record (one-time request id per form).

### 5.5 Budgets
- Must: set a monthly limit per expense category per currency; copy last month's budgets.
- Must: show spent, remaining and percentage (§6.7); approaching-limit and over-limit states are distinct and not conveyed by colour alone.
- Must (Phase 6): edit (limit, warning threshold), archive/restore and delete budgets; month navigation; category spending breakdown incl. unbudgeted spending; in-app warnings at a configurable threshold and at 100 %, never duplicated. No email or push notifications until their infrastructure and consent rules exist.

### 5.6 Recurring income and expenses
- Must: create rules (daily/weekly/monthly/yearly, every N), start date, optional end date; pause, resume, edit, delete.
- Must: due entries are created exactly once (§6.6).

### 5.7 Savings goals
- Must: create goals (name, target, currency, optional target date, optional linked account); add and withdraw contributions; show progress, remaining amount and achieved state (§6.8).

### 5.8 Dashboard & analytics
- Must: balance per currency across active accounts; optional approximate combined total (Q-2).
- Must: this month's income, expenses and net per currency (transfers excluded).
- Must: budget progress for this month; savings goal progress; recent activity.
- Must: one spending-by-category chart for the month. No decorative charts.
- Must: every figure reconciles exactly with the history list for the same filters (automated tests).
- Must (Phase 5): a period filter — this month, last month, last 30 days, last 90 days, this year, custom range — shared by every period figure, chart and list; income vs expenses over time; monthly spending trend; account balance breakdown; savings rate. Definitions in §6.12.

### 5.9 Reports & export
- Must: income and expense reports, spending by category, cash flow, account history, budget performance and period-over-period comparison, per currency, for daily/weekly/monthly/yearly groupings and preset or custom date ranges (Phase 9; definitions in [REPORTS.md](REPORTS.md)).
- Must: one filter set (period, account, type, category, currency) shared by every report and the export.
- Must: totals match the history list for the same filters.
- Must: export the filtered history to CSV (§6.11).

### 5.10 Responsive design
- Must: fully usable from 360 px wide (phone) through tablet (768–1024 px) to desktop, with touch and keyboard. See UI_GUIDELINES §4.

## 6. Financial rules

These rules are normative. Code, database constraints and tests must agree with them. Where a rule depends on an open question, the proposed default is shown and marked.

### 6.1 Classification: income, expense, transfer

| Situation | Recorded as |
|---|---|
| Salary, sales, gifts received, interest | **Income** on the receiving account, with an income category |
| Purchases, bills, fees, gifts given | **Expense** on the paying account, with an expense category |
| Moving money between two of the user's accounts (ATM withdrawal bank → cash, top-up bank → wallet, currency exchange USD cash → KHR cash) | **Transfer** |
| Opening balance of a new account | Neither — stored on the account (`opening_balance`) and excluded from income/expense totals |
| Fee charged on a transfer | A separate **expense** on the account that paid it **[D-1]** |
| Refund of an earlier purchase | **Q-3** — proposed: income in a "Refunds" income category; does not reduce budget spending |
| Correcting a balance that has drifted from reality | **Q-9** — proposed: an "Adjust balance" entry excluded from income/expense reports and budgets |

Rules:
- Every income/expense has exactly one account and one category of the matching type. Enforced by a composite foreign key.
- Amounts are always **positive**; direction comes from the type. There are no negative transactions.
- A transfer always has two different accounts owned by the same user. Transfers **never** appear in income, expense, budget or category totals. Structural: they live in a separate table.
- **v1: both accounts of a transfer must use the same currency**, and amount sent = amount received (enforced by the service and the `transfers_same_amount_chk` constraint). Cross-currency transfers (both amounts entered, implied rate shown) are a later change: drop that constraint and relax the service rule.
- Valid dates: 2000-01-01 up to one year after today in the user's timezone.
- Records of an **archived** account are frozen (no add, edit or delete), so its zero balance stays zero.

### 6.2 Balance calculation

```
balance(account, asOf) = opening_balance
                       + Σ income         on account with date ≤ asOf
                       − Σ expenses       on account with date ≤ asOf
                       − Σ transfers out  of account with date ≤ asOf   (amount sent)
                       + Σ transfers in   to account with date ≤ asOf   (amount received)
```

- Balances are **always derived** from records; never typed in or stored. They cannot drift.
- **Current balance** uses `asOf = today` in the user's timezone. Records dated in the future are shown as "Upcoming" and included only in a separate **projected balance**. **[Q-6]** (proposed default).
- Balances may be negative (e.g. overdrawn bank account). The UI shows a warning for negative cash/wallet balances but does not block the entry. **[D-2]**
- Totals by currency = sum of current balances of **active** accounts in that currency. Archiving requires a zero balance **[Q-10]** (proposed), so totals never hide money.

### 6.3 Money storage and arithmetic

- Every amount is an integer number of the currency's **minor unit**: `bigint` in TypeScript, `BIGINT` in PostgreSQL.
- Minor-unit exponent: **USD 2** (cents), **KHR 0** (whole riel) **[Q-1]** (proposed).
- JavaScript `number`, `parseFloat`, `toFixed` and `Math.round` are never used for money. Parsing is string → integer (`parseMoney`); display is integer → exact decimal string → `Intl.NumberFormat` (`formatMoney`). Aggregates are computed in SQL.
- Input accepted: digits with optional thousands commas and at most the currency's number of decimals (`1,250.50`). Rejected: scientific notation, symbols, more decimals than allowed, zero (unless the field allows it), negatives (unless the field allows it).
- Maximum single value: 999,999,999,999,999 minor units.
- Rounding happens in exactly one place: approximate currency conversion for display (half away from zero). Percentages for display are computed with integer arithmetic and rounded down (a budget shows 100% only when fully used).

### 6.4 Currencies: USD and KHR

- Each account, budget and savings goal has exactly one currency. An income/expense uses its account's currency. Account currency is immutable.
- **No conversion is ever stored or used in an authoritative figure.** Balances, budgets, goals, reports and exports are computed per currency.
- Approximate combined totals **[Q-2]** (proposed, not built): would need an approved exchange-rate source and rounding policy. Until then no total is ever converted and Settings has no rate field (§6.13).
- Budgets count only expenses from accounts in the budget's currency **[Q-8]** (proposed). A user who spends from both USD and KHR accounts in one category sets two budgets.
- Savings goal contributions are in the goal's currency.
- CSV export includes the currency on every row; amounts are never converted.

### 6.5 Dates and timezones

- A financial event has a **calendar date** (no time of day), stored as `DATE`.
- "Today", "this month" and month boundaries are calculated in the **user's IANA timezone** (default `Asia/Phnom_Penh`), never the server's.
- Allowed dates: from 2000-01-01 to one year after today **[D-3]**. Future dates are allowed (see §6.2 for balance treatment).
- Changing the user's timezone never changes stored dates; only "today" moves.
- Within one date, records are ordered by creation time (newest first in lists).
- Audit timestamps (`created_at`, `updated_at`) are UTC instants and are not shown as financial dates.

### 6.6 Recurring execution

- A **rule** defines: name, type (income/expense), account (its currency), category of the matching type, amount > 0, optional payee and note, frequency (**weekly, monthly, yearly**; daily is not offered yet), interval N (every N periods, 1–365), start date, optional end date. A rule is a schedule, never a transaction; the UI labels them differently and lists scheduled dates as "Upcoming — not posted".
- **States:** Active, Paused (with a reason: by the user, account archived, category archived, repeated failures) and Completed (no dates left).
- **Calendar policy:** occurrence *k* is computed **from the start date** (not from the previous occurrence). Monthly and yearly dates clamp to the last day of short months: 31 Jan → 28/29 Feb → 31 Mar → 30 Apr; 29 Feb → 28 Feb in common years → 29 Feb in leap years. Weekly = start + 7 × N × k days. Dates are calendar dates in the user's timezone.
- An occurrence becomes a real transaction **on its date or later, never earlier**, posted **automatically** **[Q-4, confirmed]**. Posted transactions link to their rule ("Posted by Recurring: …") and are otherwise ordinary records.
- **Execution** is done only by the scheduled engine (docs/OPERATIONS.md): never because a page is opened (confirmed by the user, Phase 7). Each occurrence is unique on `(rule, occurrence date)`; posting, history and the next date are written in one database transaction under a row lock that concurrent workers skip; retries and concurrent runs cannot post twice.
- **Catch-up policy:** a new rule starts at its first date on or after today; past dates (start up to one year back) are posted only if the user explicitly chooses "Also record the past occurrences". Dates missed while the scheduler was not running and the rule was active are posted by the next run (≤ 50 per rule per run).
- **Paused** rules post nothing. On resume, dates that fell during the pause are **skipped** **[Q-5, confirmed]**.
- **Editing** affects only dates not yet posted; a date already posted is never posted again. **Deleting** a rule keeps its posted transactions (the link is removed).
- **Archived account or category:** new and edited rules are refused; the engine pauses an existing rule with that reason; resuming requires restoring it (or editing the rule).
- **Failures** are recorded per occurrence with a safe reason and retried on later runs; after 5 failed attempts the rule is paused and shown to the user.
- A rule completes when its next date would be after the end date (inclusive).

### 6.7 Budget calculations

- A budget is (expense category, month, currency, limit > 0). One budget per category per month per currency.
- **Spent** = Σ expenses in that category, dated within that calendar month, on accounts in the budget's currency — including future-dated entries in the month. Transfers and income never count (refunds: Q-3).
- **Remaining** = limit − spent (may be negative: "Over by …").
- **Percent used** = ⌊spent × 100 ÷ limit⌋ (integer arithmetic). May exceed 100 % so overspending is visible. A limit ≤ 0 is impossible (validation + CHECK) and would be shown as "Invalid limit" without dividing.
- Status **[D-4]**, per budget with its own warning threshold *t* (1–100 %, default 80): below *t* "On track" (neutral); ≥ *t* "Almost at limit"; spent = limit "Limit reached"; spent > limit "Over budget". Each status has an icon and words, never colour alone.
- **Warnings (in-app):** one when spending first reaches *t* and one at 100 %, stored per (budget, threshold) with a unique constraint, so a threshold warns at most once per budget (= per month). Warnings are re-evaluated after every expense create/edit/delete (old and new budget), budget create/edit/archive/restore, and reconciled when the month is viewed. If spending falls back below a threshold the warning is marked resolved (hidden, kept); reaching it again re-activates the same warning silently — no duplicate. Archived budgets never warn.
- **Archive:** hides a budget from its month's totals and warnings; restorable; history kept. **Delete** removes the budget and its warnings; expenses are never affected.
- **Copy last month:** creates the previous month's active budgets (limit and threshold) that do not yet exist, skipping archived categories.
- **Periods:** monthly only. Custom budget periods are not supported: months match how users plan, keep one budget per category per period unambiguous, and make warnings "once per period" well defined; a custom period would overlap months and double-count. Revisit only with a concrete need.
- **Refunds (Q-3, open):** not a separate concept yet. A refund recorded as income does not reduce budget spending; to correct a mistaken expense, edit or delete it (the budget updates immediately).
- No rollover of unused budget in v1 **[D-5]**. Month total = Σ category limits per currency; unbudgeted spending is shown separately.
- Budgets for archived categories remain visible for past months; new budgets require an active category.

### 6.8 Savings goals

- A goal has a name, currency, target amount > 0, optional target date and optional linked account.
- Progress is tracked by **contributions** — positive (set aside) or negative (withdrawn), never zero. **Saved** = Σ contributions; it can never go below zero (a withdrawal larger than saved is rejected).
- Contributions are **earmarks**, not money movements: they do not change any account balance, the ledger, budgets or reports **[Q-7 A — chosen in Phase 8 on the user's request for a recommendation]**.
- Achieved when saved ≥ target; saving beyond the target is allowed. Achieved state is derived, not stored.
- If the total earmarked for goals linked to an account exceeds that account's current balance, the UI shows a warning (not a block).
- Required monthly saving to reach a dated goal = ⌈remaining ÷ months left⌉, displayed only; months left = calendar months from this month to the target month, inclusive. A passed target date shows "Target date passed".
- The goal's currency must match its linked account and is fixed once money has been set aside. Names are unique per user (case/space-insensitive). Contribution dates run from 2000-01-01 to today.
- A withdrawal larger than saved, or removing a contribution that later withdrawals rely on, is rejected — checked under the goal's row lock so concurrent withdrawals cannot overdraw. Each contribution carries a one-time request id (double submits record once).
- Archived goals keep their history but accept no contributions; deleting a goal deletes its contributions (no balance changes).

### 6.9 User data ownership

- Every financial record belongs to exactly one user. There is no sharing and no administrator access to financial data in v1.
- A user can read, change and export only their own records. Requests for another user's record behave exactly like a non-existent record ("not found").
- Ownership is enforced in three layers (SECURITY.md §4): session-derived user id, `user_id` in every query, and composite foreign keys in the database.
- Deleting a user account permanently deletes all of their data in one database transaction.

### 6.10 Editing and deletion

| Record | Edit | Delete |
|---|---|---|
| Income / expense | All fields. Changing type requires a category of the new type. | Allowed, with confirmation. Permanent. |
| Transfer | All fields (accounts, amount, date, note) — unless it has been reversed or is itself a reversal. | Allowed, with confirmation. Permanent. A reversed transfer can only be deleted after its reversal. |
| Transfer reversal | "Reverse" creates the opposite transfer dated today, linked to the original (`reverses_transfer_id`); at most one per transfer; a reversal cannot itself be reversed. | Deleting the reversal restores the original's effect. |
| Converting income/expense ↔ transfer | Done as delete + create in one database transaction. | — |
| Account | Name, type, opening balance, archived flag. **Not** currency. | Only if it has no records; otherwise archive. Archive requires zero current balance (Q-10). |
| Category | Name, colour, archived flag. Type only if unused. | Only if unused; otherwise archive. |
| Budget | Limit. | Allowed. |
| Recurring rule | Any field; affects future occurrences only. | Allowed; created entries are kept. |
| Savings goal / contribution | Any field. | Allowed; deleting a goal deletes its contributions. |

- Editing or deleting past records changes past balances and reports — this is expected; there is no period locking in v1 **[D-6]**.
- Lost-update protection: edit forms carry the record's `updated_at`; the save is rejected with "This entry was changed elsewhere — reload to see the latest version" if it changed meanwhile **[D-7]**.
- No edit history / audit trail in v1 **[Q-11]** (proposed).
- No undo in v1; destructive actions require confirmation.

### 6.11 CSV export and import boundaries

**Export (v1, Phase 9)** — full definition in [REPORTS.md §3](REPORTS.md#3-csv-export).
- Scope: the user's own income, expenses and transfers matching the current filters (Transactions page or Reports page). At most 50,000 rows per file; larger requests are refused with a message to narrow the filters (never truncated). *(Replaces the earlier "date range required, max 3 years" draft, D-8: the row limit bounds the work directly.)*
- Format: RFC 4180, UTF-8 **with BOM** (Excel compatibility and Khmer text), comma separator, CRLF line endings, header row.
- Columns: `Date, Type, Amount, Currency, Account, To account, Category, Payee, Note, Reversal, Record ID`.
- Amounts are positive plain decimal strings in the record's currency with the currency's digits (`12.50`, `41000`); the Type column gives the direction. Never converted, never formatted with symbols or grouping.
- Dates as `YYYY-MM-DD`.
- Formula-injection protection: user-entered text beginning with `=`, `+`, `-`, `@`, tab or carriage return (also after leading spaces) is prefixed with `'`; system-generated values (dates, amounts, ids) are not.
- Generated server-side on request and streamed in batches; never stored on the server.

**Import (not in v1)** — boundaries for when it is added:
- Preview first; nothing is saved until the user confirms.
- Every row validated with the same rules as manual entry; the whole file is saved atomically or not at all.
- The user maps the file to one account; amounts must be in that account's currency. Transfers are never inferred from imports.
- Likely duplicates (same date, amount, description) are flagged for the user to decide.
- File size and row limits; no formulas evaluated; imported text treated as plain text.

### 6.12 Dashboard metrics (Phase 5)

| Figure | Definition |
|---|---|
| Period | Inclusive calendar dates in the user's timezone. This month = 1st → today; last month = whole previous month; last 30 / 90 days = today and the 29 / 89 days before; this year = 1 Jan → today; custom = any range up to 1,830 days (reversed bounds are swapped). Presets stop at today, so upcoming (future-dated) records are not counted as income or spending that already happened. |
| Income / Expenses | Σ income / Σ expense records dated in the period, **per currency** (the account's currency). Transfers are never included. Records on archived accounts **are** included — history is never dropped. |
| Net cash flow | Income − expenses, per currency. |
| Savings rate | (income − expenses) / income × 100, one decimal, per currency, only when income > 0; otherwise shown as "—" ("No income in this period"). May be negative. |
| Balance | Current balance (as of today, §6.2) of **active** accounts per currency — the same figures as the Accounts page. Not a period figure and labelled "Balances today". Archived accounts are excluded because they hold zero by rule (Q-10), so nothing is hidden. |
| Spending by category | Σ expenses per category in the period, in the selected chart currency; top 7 shown, the rest grouped as "Other"; shares of that currency's period spending. |
| Income vs expenses chart | The same records as the income/expense figures, per day (≤ 31 days), week (Mondays, ≤ 183 days) or month; empty buckets shown as zero. The cards and this chart come from one query, so they always agree. |
| Monthly spending | Σ expenses per month for the 6 calendar months ending with the period's last month, cut off at the period's end date. |
| Recent transactions | The 8 newest records (including transfers) dated in the period. |

Amounts in different currencies are never added together. Charts show one currency at a time (switchable).

### 6.13 Settings and display preferences (Phase 10)

| Setting | Effect | Never does |
|---|---|---|
| Name | Shown in the account menu. Optional, ≤ 60 characters. | — |
| Email | Shown, not editable. Changing the sign-in email needs a verification e-mail to the new address, which needs an e-mail provider (Q-12). | Change without verification. |
| Password | Changed only with the current password; every session then ends. Sign out everywhere available. | — |
| Default currency | Pre-selected when adding accounts, budgets and goals; first chart currency on the dashboard. | Convert or relabel any existing amount or account. |
| Timezone | Decides "today", "this month" and date presets everywhere. | Move stored calendar dates (records keep the date they were entered with). |
| Date format | `17 Oct 2026` (default), `Oct 17, 2026`, `17/10/2026`, `2026-10-17`. | Change stored dates or the CSV/JSON export format. |
| Number format | `1,234.56` (default), `1.234,56`, `1 234,56`. Each currency keeps its own decimals (USD 2, KHR 0). Amount fields also accept `12,50`, `1.234,56` and `1 234,56`; `1,234` always means one thousand two hundred thirty-four. | Change stored amounts or export format. |
| Show currencies as | Symbols (`$12.50`, `៛41,000`) or codes (`USD 12.50`, `KHR 41,000`). Screens that mix currencies also label totals with the code. | — |
| Budget warnings | All (threshold + 100 %), only at the limit, or off. Saving re-syncs the bell immediately (unwanted warnings are resolved, wanted ones appear). In-app only. | Send e-mail or push notifications. |
| Warning level for new budgets | Suggested threshold (1–100 %) in the Add budget form; each budget keeps its own. | Change existing budgets. |
| Your data | CSV of transactions (§6.11) and a JSON file with every record (accounts, categories, transactions, transfers, budgets, recurring items, goals and contributions; exact decimal strings plus currency). No password hash, session data, tokens or internal keys. | — |
| Delete account | Shows counts of what will be deleted and offers the JSON download; requires the password and typing DELETE. One cascading delete removes every row the user owns; sessions end because the user no longer exists. | Leave orphaned records or touch other users. |

**Currency conversion:** none, anywhere. The earlier "Riel per US dollar" setting was removed from Settings because no figure used it; the column is kept, unused, until Q-2 (an explicit rate and rounding policy) is approved.

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Correctness | Rules in §6 enforced in services, backed by database constraints, covered by tests. |
| Integrity | Multi-record changes are atomic (one database transaction). |
| Security | See SECURITY.md. OWASP ASVS level 2 as the reference standard. |
| Privacy | No third-party analytics or trackers. Logs never contain amounts, descriptions, emails or tokens. |
| Performance | Dashboard server time < 500 ms p95 for a user with 10,000 records. |
| Accessibility | WCAG 2.2 AA. |
| Responsiveness | 360 px phones, tablets, desktop; no horizontal page scroll. |
| Browsers | Latest two versions of Chrome, Safari, Firefox, Edge; iOS Safari 17+. |
| Reliability | Database backups and migration-based schema changes (deployment-dependent; Q-14). |

## 8. Success measures

- An expense can be recorded on a phone in under 15 seconds.
- Zero reconciliation differences between dashboard, reports and history in automated tests.
- No cross-user data access in automated authorization tests.

## 9. Decisions needing approval

Proposed defaults are used for planning only. Items marked ★ block the phase shown.

| ID | Question | Proposed default | Blocks |
|---|---|---|---|
| Q-1 | KHR precision | **Applied in Phase 3:** whole riel only (exponent 0). Not explicitly confirmed; change before real data exists if needed | — |
| Q-2 | Show approximate combined totals across currencies? | Yes, dashboard only, user-maintained rate, labelled "≈ approx." | Phase 5 |
| Q-3 | How are refunds recorded? | Income in a "Refunds" category; budgets not reduced. Alternative: a refund entry that reduces spending in the original expense category | ★ Phase 4 |
| Q-4 | Recurring entries: automatic or confirm first? | Automatic on the due date — **confirmed by the user (Phase 7)** | ★ Phase 7 |
| Q-5 | Missed occurrences while paused | Skipped on resume — **confirmed by the user (Phase 7)** | Phase 7 |
| Q-6 | Do future-dated entries affect the current balance? | No; shown as Upcoming and in a projected balance | ★ Phase 4 |
| Q-7 | Savings goal model | Earmark contributions (don't move money) — **chosen (A) in Phase 8** | ★ Phase 8 |
| Q-8 | Budgets across currencies | Per currency only; no conversion — **applied in Phase 6** | ★ Phase 6 |
| Q-9 | Balance corrections | "Adjust balance" entry excluded from reports and budgets (needs a category flag) | Phase 4 |
| Q-10 | Archiving an account with money in it | **Applied in Phase 3:** not allowed; current and projected balance must be zero. Not explicitly confirmed | — |
| Q-11 | Edit history / audit trail in v1 | No | Phase 4 |
| Q-12 | Email provider for password reset / email verification | Recovery flow is implemented behind `MAIL_TRANSPORT`; production stays `none` (feature hidden) until a provider is chosen | Production enablement of recovery |
| Q-13 | Credit cards / liabilities | Out of v1 | — |
| Q-14 | Deployment target (affects scheduler, database hosting, backups) | Undecided; plan works on any Node host + PostgreSQL | Phase 10 |
| Q-15 | Khmer-language UI in v1 | No; English only, copy kept simple for later translation | — |
| Q-16 | Product name | "Personal Finance" placeholder | — |
