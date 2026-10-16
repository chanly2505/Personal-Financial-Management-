# Reports and CSV export

Phase 9. What each report shows, how its numbers are computed, and the limits of the CSV export. Code: `src/features/reports/` (reports), `src/features/transactions/server/export.ts` and `src/app/api/transactions/export/route.ts` (export).

## 1. Rules shared by every report

| Rule | Definition |
|---|---|
| Source | Persisted records only: income, expenses and transfers. Nothing is cached or pre-aggregated, so a report always reflects the records as they are now. |
| One filter set | Period, account, type, category and currency. Every report, the "View the N records" link and the CSV export apply them with the **same SQL** (`ledgerCte` + `ledgerWhere` in `src/features/transactions/server/repository.ts`) as the Transactions list. Filters live in the URL, so a report can be bookmarked or shared. Invalid values are ignored (the page falls back to defaults instead of failing). |
| Account filter | Matches records on the account, including transfers **into** it (same as the Transactions list). |
| Transfers | Never income or expenses. They appear in record counts, in the cash-flow "Transfers" column, in account history (as money in/out of that account) and in the export. |
| Currencies | Every figure is per currency. Amounts in different currencies are never added together and never converted (Q-2 is still open). |
| Dates and timezone | Records carry a calendar date (`YYYY-MM-DD`) with no time of day, so a record belongs to exactly the day it was entered for. "Today" — used by the presets — is the date in the user's profile timezone. Weeks start on Monday. |
| Upcoming records | "To date" presets (today, this week, this month, this year) stop at today, so future-dated records are not counted as if they had happened. A custom range that includes future dates includes the upcoming records dated in it. |
| Deleted records | Deletion is permanent (hard delete), so deleted records are not in any report or export. |
| Archived accounts and categories | Included — history is never hidden. Category tables mark them "(archived)"; the filter lists mark archived accounts and categories. |
| Reversed transfers | A reversal is an ordinary opposite transfer linked to the original. Both are listed; together they cancel out in balances. Neither is income or expense. The export's *Reversal* column links them. |
| Reconciliation | The totals bar (per currency: income, expenses, net, records) comes from the same query as the Transactions page totals. Series, category and account breakdowns are computed from the same filtered records and add up to those totals (`tests/integration/reports.test.ts`). |

### Periods

Presets: Today; This week (Monday → today); This month (1st → today); Last month; Last 30 days; Last 90 days; This year (1 Jan → today); Last year; Custom range (any dates, reversed bounds swapped, at most 1,830 days — longer ranges are shortened from the start).

### Grouping (daily, weekly, monthly, yearly)

"Group by" sets the rows of series reports: Automatic (daily up to 31 days, weekly up to 183 days, monthly beyond), Daily, Weekly, Monthly or Yearly. Empty days/weeks/months/years are shown as zero. A first or last bucket may be partial (e.g. the week containing 1 March starts on the Monday before, but only records within the period count). If a choice would give more than 370 rows (e.g. daily over 5 years), the next coarser grouping is used and the page says so.

## 2. Reports

| Report | Shows |
|---|---|
| **Income** | Per currency: total income; income per day/week/month/year (chart + table); income by category and by account, with record counts and shares. |
| **Expenses** | The same for expenses. |
| **By category** | Per currency: every expense category and every income category with records, amount, share of the currency's total, and a total row. |
| **Cash flow** | Per currency and bucket: income, expenses, net (income − expenses), running net from the start of the period, and the number of transfers. |
| **Account history** | For one account: opening balance (end of the day before the period, including the account's opening balance), money in (income + transfers in), money out (expenses + transfers out), closing balance (end of the period's last day) and each record with its running balance. Without type/category filters, *opening + in − out = closing* is checked and stated on the page. With type/category filters the running balance is hidden (it would not add up). The first 500 records are listed; totals cover all of them and the CSV export has the full list. |
| **Budgets** | Budget performance for each month the period touches (latest 12 months): limit, spent, remaining, % used and status per budget, and per-currency totals of active budgets. Budgets are monthly and count expenses on every account in their currency for the **whole** month (PRD §6.7), so only the currency and category filters apply. Archived budgets are listed and labelled. |
| **Compare periods** | This period against the previous one, per currency: income, expenses, net and record counts with the change in amount and percent ("New" when the previous value is zero), plus every expense and income category in either period. Previous period: for this month / this year to date, the same days of the previous month / year (1–16 Oct → 1–16 Sep); for whole calendar months (last month, last year, or a custom range from a 1st to a month end), the same number of whole months just before; otherwise the same number of days just before. |

## 3. CSV export

Available from the Reports page (the records behind the current report: its dates, account, type, category and currency) and from the Transactions page (exactly its current filters, including search and amount range). Endpoint: `GET /api/transactions/export?<Transactions filters>`.

**Format**

| Item | Value |
|---|---|
| Encoding | UTF-8 **with BOM** (so Excel reads Khmer text correctly), comma separator, CRLF line endings, RFC 4180 quoting (fields with a comma, quote or line break are quoted; quotes are doubled). |
| Header row | `Date,Type,Amount,Currency,Account,To account,Category,Payee,Note,Reversal,Record ID` |
| Date | `YYYY-MM-DD` — the record's calendar date as entered. |
| Type | `Income`, `Expense` or `Transfer`. |
| Amount | Positive plain decimal in the record's currency: `.` as decimal point, no grouping, no symbol; always the currency's digits — USD 2 (`1234.50`, `0.05`), KHR 0 (`40000`). The Type column gives the direction. |
| Currency | `USD` or `KHR` (the account's currency; both legs of a transfer share it). |
| Account / To account | For a transfer, *Account* is where the money left and *To account* where it arrived; *To account* and *Category* are empty for other types. |
| Reversal | `Reverses <id>` / `Reversed by <id>` for reversed transfers, else empty. |
| Order | Date order: oldest first when the Transactions list is sorted "Oldest first" (Reports always use oldest first), otherwise newest first. Sorting by amount is not applied to exports. |
| File name | `transactions-<today>.csv` |

**Safety**

- **Formula injection:** text the user typed (account, category, payee, note) that starts with `=`, `+`, `-`, `@`, a tab or a carriage return — also after leading spaces — is prefixed with `'`, so spreadsheets show it as text and never run it (OWASP CSV Injection). Values the app generates (dates, amounts, ids) are not changed, so amounts stay numbers.
- **Authorization:** the user is always the signed-in session user; there is no user parameter. Account and category ids in the URL only narrow that user's own records — another user's id simply matches nothing. 401 without a session.
- **Content:** record fields only. No user ids, e-mail addresses, password or session data, or other personal information. Responses are `Cache-Control: no-store` and never stored on the server.

**Limits**

- At most **50,000 rows** per file. Larger requests are refused with a message to narrow the dates or filters (the page hides the button and says so); files are never silently truncated.
- Rows are streamed in batches of 1,000 using keyset pagination on (date, created time, id), so memory use stays flat and a record is never written twice. Records added or deleted while a download is running may or may not appear in it.
- Goal contributions (earmarks) and budgets are not exported; recurring rules are not exported (their posted transactions are).
- Importing CSV is not supported (PRD §6.11).

## 4. Tests

| Area | Tests |
|---|---|
| CSV escaping, formula injection, BOM | `tests/unit/csv.test.ts` |
| Presets, previous period, buckets, granularity limits, leap years | `tests/unit/report-period.test.ts` |
| Totals per currency, boundary days, reconciliation with Transactions totals, weekly/daily/yearly series, breakdowns, every filter, account history (opening/closing, transfers, reversals, truncation), budgets, comparison, cross-user isolation | `tests/integration/reports.test.ts` |
| Export through the route: 401, cross-user ids, headers, BOM, dates/decimals/currency/type, escaping and injection, every filter, keyset batching with ties, row limit, 3,500-row export | `tests/integration/export.test.ts` |
| Pages on desktop, tablet and mobile: totals, tabs, filters, downloads from Reports and Transactions | `e2e/reports.spec.ts` |
