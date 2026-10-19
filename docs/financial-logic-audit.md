# Financial logic audit

Phase 1 of the production-readiness audit (19 Oct 2026, commit `4afa2ad`). Read-only review of money storage, parsing, totals, balances, transfers, budgets, goals, recurring transactions, dashboard, reports and exports. No code or data was changed.

**Result:** no Critical or High defects. The money core is sound. One Medium gap (duplicate recurring rules) and several Low items were found.

## How money works today (verified)

| Rule | Evidence |
|---|---|
| Amounts are stored as BIGINT minor units: USD in cents (2 decimals), KHR in whole riel (0 decimals) | `src/lib/money.ts:28-31`, `prisma/schema.prisma`, docs/DATABASE.md §2 |
| User input is parsed from text straight to an exact integer. No floating point. More decimals than the currency allows is **rejected, not rounded**. Zero, negatives (except opening balances and withdrawals), scientific notation and values above 999,999,999,999,999 are rejected. | `src/lib/money.ts:80-118` |
| The maximum amount is below `Number.MAX_SAFE_INTEGER`, and CHECK constraints in the database enforce the same cap | `money.ts:38`, migrations |
| All totals are exact integer sums: SQL `SUM(...)::bigint` or JavaScript `0n` reductions. `Number()` is used only for chart geometry and percentages. | Repositories and `dashboard/format.ts:38` |
| **USD and KHR are never converted.** Every balance, total, chart, budget and goal is grouped by currency. The stored exchange rate is not used anywhere. | `accounts/server/service.ts:284-293`, `dashboard/server/service.ts:146-163`, `reports/server/repository.ts:50-57`, `schema.prisma:89-90` |
| **Transfers are never income or expense.** The dashboard and budgets read only `transactions`; the ledger, reports and CSV filter by kind. | `transactions/server/repository.ts:557-558`, `reports/server/repository.ts:107`, `export.ts:90-108` |
| Cross-currency transfers are blocked twice: by the service under a lock, and by the database CHECK requiring equal amounts | `transactions/server/service.ts:219-222`, migration `transfers_same_amount_chk` |
| **Balances are calculated, not stored:** opening balance + income − expense − transfers out + transfers in, in one SQL query. Editing or deleting a record therefore can never leave a balance out of date. | `accounts/server/repository.ts:200-226` |
| Multi-row writes run in `prisma.$transaction`, with accounts locked `FOR SHARE` in id order. Edits use optimistic concurrency on `updated_at`. | `transactions/server/repository.ts:36-52` |
| A double click or retry never records an entry, transfer, reversal or goal contribution twice: a unique `(user_id, client_request_id)` constraint with a winner re-read | `transactions/server/repository.ts:112-136, 242-266`, `goals/server/repository.ts:218-257` |
| Recurring engine: rule rows locked with `SKIP LOCKED`, `ON CONFLICT (rule, date) DO NOTHING`, next date advanced in the same transaction. A posted date is never posted again, even after the transaction is deleted. | `recurring/server/repository.ts:301-432` |
| A category's type must match the record's type: enforced by a composite foreign key and by the service | `schema.prisma:197`, `categories/server/service.ts:137-154` |
| Budget spent = expense category, accounts in the budget's currency, half-open month `[first day, first day of next month)`. Threshold maths uses integers (`spent*100 >= limit*pct`). | `budgets/server/repository.ts`, `budgets/usage.ts:20-22` |
| "Today" is the user's own time zone everywhere. Entry dates range from 2000-01-01 to today + 366 days. Contributions cannot be future-dated. Dashboard and reports share period boundaries. | `lib/dates`, `transactions/server/service.ts:174-185` |
| CSV: plain positive decimals with the currency's digits, transfers labelled "Transfer" with both accounts, formula-injection protection, UTF-8 BOM | `src/lib/csv.ts`, `transactions/server/export.ts` |

## Findings

### FIN-1: Creating a recurring rule has no duplicate-submit protection
- **Severity:** Medium.
- **Evidence:**
  - `src/features/recurring/schemas.ts:49-53`: `createRecurringSchema` has no `clientRequestId`.
  - `src/features/recurring/server/repository.ts:95-109`: `createRule` is a plain `create`.
  - Nothing makes a rule unique. Entries, transfers, reversals and contributions all have `@@unique([userId, clientRequestId])`.
  - The only guard is the button's loading state (`recurring-form.tsx:344`).
- **User impact:** A retry on a slow connection, or a second tab, can create two identical rules. Every occurrence is then posted twice, as real income or expense, so balances, budgets and reports are wrong until the user notices and deletes the duplicates.
- **Recommended fix:** Add a nullable `client_request_id` column to `recurring_rules` with a unique index on `(user_id, client_request_id)`. This migration is additive, keeps all existing data, and can be rolled back by dropping the index and the column. Send a request id from the form, and reuse the existing idempotent-create pattern.
- **Acceptance criteria:** Two concurrent creates with the same request id produce one rule, and the second returns the first rule's id. An integration test races them. Existing rules are unchanged.

### FIN-2: "Compare periods" shows a minus sign for tiny increases
- **Severity:** Low (display only).
- **Evidence:** `src/features/reports/components/report-sections.tsx:646-652` takes the sign from the rounded value: `value > 0 ? "+" : "−"`. A change that rounds to 0.0% (e.g. 10,001 vs 10,000) reads "−0.0%" even though it went up.
- **User impact:** A misleading direction on the reports comparison table.
- **Recommended fix:** Take the sign from `current - previous` (bigint) rather than the rounded value.
- **Acceptance criteria:** `changePercent(10001n, 10000n)` gives "+0.0%". Add unit tests; `changePercent` has none today.

### FIN-3: Archived-category check runs outside the write lock
- **Severity:** Low.
- **Evidence:**
  - `transactions/server/service.ts:251-253` checks the category before the transaction. The lock covers accounts only (`repository.ts:36-52`).
  - Category archiving is an unlocked update (`categories/server/service.ts:105-109`).
  - Recurring rules have the same gap (`recurring/server/service.ts:201-203`).
- **User impact:** In a narrow race, a record can be saved into a category that was archived a moment earlier. Totals stay correct; the record is just filed under an archived category. A wrong income/expense type is impossible, because the foreign key blocks it.
- **Recommended fix:** Inside the transaction, read the category `FOR SHARE` and re-check `is_archived`.
- **Acceptance criteria:** A repeated race test (archive vs create) never leaves a new record in an archived category.

### FIN-4: "Same-currency transfer" and "account currency never changes" are not enforced in the database
- **Severity:** Low (defence in depth).
- **Evidence:**
  - The database requires equal transfer amounts, but nothing compares the two accounts' currencies.
  - Account currency is fixed only because no code path updates it (`accounts/server/repository.ts:70-96`).
- **User impact:** None today. A future bug or a manual SQL edit could create a USD→KHR transfer with equal numbers, or change a used account's currency, and silently distort balances.
- **Recommended fix:** Add a trigger, prepared for review, that rejects a transfer whose two accounts have different currencies, and one that rejects changing `accounts.currency` once the account has records. The rollback is to drop the triggers. Existing data must be checked first; it should already comply.
- **Acceptance criteria:** Raw-SQL attempts fail in `tests/integration/schema-constraints.test.ts`. All existing rows pass the check before the trigger is added.

### FIN-5: Docs and comments contradict the no-conversion policy
- **Severity:** Low (documentation).
- **Evidence:**
  - docs/DATABASE.md:38 ("two amounts for cross-currency") and :59 (the rate is "used for … approximate combined totals").
  - `schema.prisma:211-212` and the `convertMinor` comment in `money.ts:210-213` say the same.
  - The code never converts, and `convertMinor` is used only by its unit test.
- **User impact:** A future developer could "fix" the code to match the wrong docs.
- **Recommended fix:** Align the docs and comments with the policy (PRD §6.1, QA_REPORT R10): no conversion and no cross-currency transfers in v1. Mark `convertMinor` as reserved, or remove it.
- **Acceptance criteria:** No doc or comment claims cross-currency transfers or combined totals exist.

### FIN-6: Budget-alert refresh runs after the save, outside its transaction
- **Severity:** Low.
- **Evidence:** `transactions/server/service.ts:292, 311-321`, `budgets/server/service.ts:139-148` (best effort; failures are logged), `recurring/server/service.ts:377-387`.
- **User impact:** If the server stops between the save and the refresh, the warning bell can be stale until /budgets is opened, which reconciles it. Budget amounts themselves are always computed live and are never wrong.
- **Recommended fix:** Optionally reconcile alerts in the hourly scheduled job.
- **Acceptance criteria:** Stale alerts fix themselves without a page view.
- **Already documented:** in code comments.

### FIN-7: The JSON data export is not a consistent snapshot and omits one transfer amount
- **Severity:** Low.
- **Evidence:** `settings/server/data-export.ts:44-58, 132-185` runs independent queries without a REPEATABLE READ transaction, and exports transfers with `fromAmountMinor` only (`:171`).
- **User impact:** An edit made during the export could produce a file that doesn't add up. Both amounts are equal in v1, so nothing is lost today.
- **Recommended fix:** Run the export in a read-only REPEATABLE READ transaction, and include both amounts.
- **Acceptance criteria:** A concurrent write during the export does not change the exported totals, and the JSON contains both transfer amounts.

### FIN-8: The "1.234,56" number format rejects dotted thousands without decimals
- **Severity:** Low (usability; nothing is mis-parsed).
- **Evidence:** `src/lib/money.ts:64-73` requires a `,dd` suffix for dotted grouping. "4.100.000" in a KHR field fails, and "410.000" says "KHR amounts must be whole numbers".
- **User impact:** Confusing errors for users who chose the European-style number format. No wrong amount is ever saved.
- **Recommended fix:** When the user's format is "1.234,56", accept `\d{1,3}(\.\d{3})+` as grouped thousands.
- **Acceptance criteria:** With that format, "4.100.000" KHR is parsed as 4,100,000 riel. Add unit tests.

### FIN-9: Consistency notes
- **Severity:** Info.
- **Evidence:**
  - Budget and goal percentages are floored to whole numbers, while dashboard and report percentages use one decimal (`budgets/usage.ts:30`, `goals/progress.ts:29`, `dashboard/server/service.ts:134-139`). Both behaviours are documented in the PRD.
  - Budget "spent" includes future-dated expenses in the month; the dashboard's "this month" stops at today (PRD §6.7).
  - A week bucket can be labelled with a date before the selected range; only in-range data is counted.
  - The opening balance has no date, so historical balances before the account existed still include it.
  - Chart geometry uses `Number()`. That would only lose precision above about 9×10¹⁵ minor units; displayed text is always exact.
- **User impact:** Small visible differences between screens.
- **Recommended fix:** Consider aligning the percentage display; otherwise none.
- **Acceptance criteria:** Not applicable.

## Test coverage

**Already covered**, and passing in this audit's `npm run check` (525/525):
- Money parsing, formatting and round-trips (`tests/unit/money.test.ts`).
- Balances = ledger = dashboard = reports = budget spent = CSV (`tests/integration/reconciliation.test.ts`).
- Savings-rate and percent rounding (`tests/unit/dashboard-math.test.ts`).
- Idempotent and concurrent entries, transfers and reversals (`transactions.test.ts`).
- Recurring idempotency, concurrency, time zones, month-end and leap days (`recurring*.test.ts`).
- Budget alerts and goals.
- CSV injection and format.
- Database constraints.
- QA-01 to QA-14 regressions.

**Gaps to add with the fixes:**
1. Concurrent or duplicate recurring-rule creation (FIN-1).
2. `changePercent`, including tiny changes (FIN-2).
3. A race between archiving a category and creating a record (FIN-3).
4. Raw cross-currency transfers and currency changes (FIN-4).
5. Editing an expense from a USD account to a KHR account: the amount is re-parsed, and both budgets' alerts update.
6. Dotted-thousands input (FIN-8).
7. JSON export reconciliation (FIN-7).

No existing financial data will be changed to make any test pass. All tests run against the local test database.
