# Implementation Plan

Phases are ordered by dependency: each phase only builds on modules finished before it. A phase is finished only when its exit criteria pass — see the Definition of Done in `CLAUDE.md`. Open questions (`Q-n`) are defined in [PRD §9](PRD.md#9-decisions-needing-approval).

## 1. Current state

The project lives in `/home/user/personal-finance`. Phases 0–11 and 13 are complete; Phase 12 (deployment) waits for the owner's Vercel and Neon accounts.

**Present and verified (end of Phase 10)**
- Next.js 16.3.8 + React 19.2 + TypeScript 5.9 (strict) + Tailwind CSS 4; ESLint (with layer-boundary rules) and Prettier.
- Prisma 7.10 schema with 9 tables and the initial migration (with hand-written CHECK constraints), applied to `finance_dev` and `finance_test`; idempotent local seed (`npm run db:seed`).
- Validated environment (`src/server/env.ts`), error model (`src/server/errors.ts`, `action-result.ts`), privacy-safe logger, `/api/health` database probe.
- Design tokens and 20 UI primitives, 6 shared components, the responsive app shell, module placeholders, loading/error/not-found boundaries, and a `/design-system` reference page.
- Authentication & authorization (Phase 2): Auth.js credentials + JWT sessions with database-checked session versions, argon2id, DB-backed rate limits, password change/recovery, sign-out-everywhere, account deletion, profile settings, nonce CSP and security headers, least-privilege DB role.
- Accounts & categories (Phase 3): CRUD, archive/restore, delete-when-unused, derived balances, per-currency totals, account history, category type rules.
- Transactions (Phase 4): income/expense/transfer CRUD, transfer reversal, idempotent creates, optimistic edits, row-locked writes, ledger with search/filters/sort/pagination and per-currency totals.
- Dashboard (Phase 5): period filter (6 presets incl. custom), per-currency income/expenses/net/savings rate, balances today with account breakdown, income-vs-expenses, spending-by-category and monthly-spending charts with table views, recent transactions; server-side aggregation with an index-only covering index.
- Budgets (Phase 6): monthly per-category, per-currency limits with live spent/remaining/usage from expense records, configurable warning threshold, archive/restore/delete, copy last month, month navigation, category spending breakdown, in-app warnings (header bell) without duplicates, dashboard budget section.
- Recurring (Phase 7): weekly/monthly/yearly rules with a documented month-end/leap-year policy, active/paused/completed states, upcoming dates, execution history, failure states; idempotent scheduled engine (cron endpoint, CLI, in-process timer) — docs/OPERATIONS.md.
- Savings goals (Phase 8): earmark goals (Q-7 A) with progress, monthly suggestion, set aside / take back (never below zero), earmark-exceeds-balance warning, archive, dashboard section.
- Reports & export (Phase 9): income, expenses, by category, cash flow, account history, budget performance and period comparison with one shared filter set and daily/weekly/monthly/yearly grouping; streamed, injection-safe CSV export from Reports and Transactions — docs/REPORTS.md.
- Settings and UX polish (Phase 10): display preferences (date format, number format, symbols or codes) applied on every page without touching data; default currency; timezone; budget-warning preferences; JSON export of all data; deletion summary; text catalog ready for Khmer; every page audited with axe-core on three widths.
- Firebase client SDK initialized (no Analytics).
- `npm run check` passes (typecheck, lint, format check, 444 Vitest tests); 239 Playwright tests pass on desktop, tablet and mobile against a production build.

**Known issues still open**
| Issue | Impact | Plan |
|---|---|---|
| Not a git repository with a remote; container storage is temporary | Work can be lost | Push to a remote as soon as one is provided |
| `ui.shadcn.com` blocked by the sandbox network policy | `npx shadcn add` fails; components are written by hand from shadcn's source | Allow the domain in environment settings, or keep hand-adding |
| PostgreSQL does not auto-start when the cloud container restarts | Integration/e2e tests fail until started | `service postgresql start`; optionally a SessionStart hook |
| npm 10 resolver bug installing some packages | Install fails with `edgesOut` error | Use `npx npm@11 install` (noted in CLAUDE.md) |
| No email provider (Q-12) | Password recovery is hidden in production (`MAIL_TRANSPORT=none`) | Add an SMTP/API transport in `src/server/mail.ts` once chosen |
| Registration reveals whether an email is taken | Inherent without email verification; rate limited | Revisit with email verification (Q-12) |
| IP-based rate limits need `TRUSTED_IP_HEADER` | Without it only email/user limits apply | Set per deployment (README production checklist) |
| Reset-request timing differs slightly for registered vs unknown emails (token write + mail send) | Low-signal enumeration vector, rate limited | Send mail asynchronously once a real provider exists |
| `auth_rate_limits` rows are not pruned automatically | Table grows slowly | Schedule `pruneRateLimits()` with the Phase 7 job |
| Geist has no Khmer riel glyph (៛); the browser falls back to a system font | Slight spacing difference around ៛ | Revisit with Khmer UI (Q-15) or a font with Khmer coverage |
| Dark-mode tokens exist but no toggle | Light theme only | Phase 10 |
| Applied migration comment references old doc path | Cosmetic | Leave (applied migrations are immutable) |

## 2. Dependency graph

```
Phase 0  Discovery & architecture ✔
   │
Phase 1  Foundation, design system, app shell ✔
   │
Phase 2  Auth & profile ─────────────────────────┐
   │                                              │
Phase 3  Accounts + Categories ✔                  │
   │                                              │
Phase 4  Transactions & Transfers + history ✔    │
   │            │                │                │
Phase 5  Dashboard (v1) ✔   Phase 6 Budgets ✔   Phase 7 Recurring
   │            │                                 │
   │      Phase 8 Savings goals ──────────────────┤
   │            │                                 │
Phase 9  Reports  ◄───────────────────────────────┘
   │
Phase 10  Hardening & release
```

The dashboard is built in Phase 5 with balances, monthly totals and recent activity, then gains budget and goal cards in Phases 6 and 8.

## 3. Phases

### Phase 1 — Foundation, design system and app shell ✔ (complete)
Delivered: tooling (ESLint boundaries, Prettier, EditorConfig), env validation, error model and logger, health endpoint, design tokens (colours, feedback states, typography, spacing, radius, shadows, focus, layout widths, breakpoints), UI primitives (button, input, textarea, select, date input, dialog, alert dialog, sheet, dropdown menu, tabs, table, card, badge, alert, tooltip, toast, skeleton, breadcrumb, label, separator), shared components (FormField, EmptyState, ErrorState, ConfirmDialog, Money, PlannedFeature), app shell (sidebar / tablet rail / phone bottom nav + "More" sheet, header, page header with breadcrumbs, page container, skip link), route placeholders for all 9 modules, loading/error/global-error/not-found boundaries, design-system page, local seed.
Verified: `npm run check`; `npm run build`; Playwright on desktop (1280), tablet (820) and mobile (Pixel 7).

### Phase 2 — Authentication and authorization ✔ (complete)
Delivered: Auth.js v5 Credentials provider with encrypted JWT cookie (7 days) and per-request session-version verification; argon2id hashing; registration (with default categories), sign-in, sign-out, sign-out-everywhere, password change, password recovery (behind `MAIL_TRANSPORT`), account deletion; profile & preferences settings; PostgreSQL-backed rate limits (email, IP, user); `requirePageUser` / `authedAction` / `withUser` helpers with consistent 401/403/404 responses; `src/proxy.ts` (optimistic redirect + per-request CSP nonce) and static security headers; open-redirect-safe `callbackUrl`; least-privilege `finance_app` database role; dev seed user without hard-coded credentials; dedicated e2e database; Next.js dev server-function argument logging disabled.
Verified: `npm run check` (162 tests incl. integration auth/session/authorization suites); `npm run build`; 122 Playwright tests on desktop, tablet, mobile; manual dev-server run of the full recovery flow (link → reset → sign-in → link reuse rejected); `finance_app` privilege checks. Test map: docs/SECURITY.md §13.

### Phase 3 — Accounts and categories ✔ (complete)
Delivered: migration `…_accounts_categories` (`archived_at`, name length caps, archive/colour/range CHECKs, listing indexes); accounts module (create with presets, edit without currency change, opening balance parsed per currency, case-/space-insensitive unique names, archive only at zero balance, restore, delete only without history, details with current/projected balance and history); per-currency totals (never combined); categories module (new default list, create/edit dialog with type and colour, type locked once used, archive/restore, delete only when unused, `assertCategoryUsable` / `listSelectableCategories` for Phase 4); read-only account activity; `SelectField` and `MoneyInput` shared components (fixing unlabelled dropdowns found during testing).
Decisions applied without explicit confirmation: Q-1 (whole riel), Q-10 (archive at zero balance) and, for the balance display, Q-6 (current balance excludes future-dated records; projected shown separately).
Verified: `npm run check` (210 tests); `npm run build`; 149 Playwright tests on desktop, tablet, mobile; screenshots with seed data (balances match the seed exactly).

### Phase 4 — Transaction management ✔ (complete)
Delivered: migration `…_transactions_ledger` (`description` renamed to `note`, new `payee`, `client_request_id` unique per user, `reverses_transfer_id` self-link unique per transfer, amount-max / same-amount / not-self-reversal CHECKs); transactions module — income/expense create/edit/delete, same-currency transfers, "Reverse" for transfers, ledger (`UNION ALL` of entries and transfers) with search, type/account/category/date/amount filters, four sort orders, pagination and per-currency income/expense/net totals over all matching rows; every write in one DB transaction that locks the touched accounts (`FOR SHARE`, id order) while archive/delete of an account take `FOR UPDATE`; idempotent creates and reversals (`clientRequestId`); optimistic concurrency on edits (`expectedUpdatedAt` → conflict); archived accounts frozen. UI: `/transactions` list (filters in the URL, collapsible on phones, summary strip, empty/no-match states, pagination, floating add button on phones, "n" shortcut), `/transactions/new` (Expense/Income/Transfer, amount focused, Enter saves, "Save and add another"), details with Edit/Delete/Reverse confirmations, edit page; account pages show the ledger for that account.
Scope changes agreed in the Phase 4 brief: **cross-currency transfers deferred** (same currency only, enforced by service and CHECK); CSV export moved to Phase 9 (Reports); convert income ↔ transfer is "delete + create" by the user.
Decisions applied without explicit confirmation: Q-6 (future-dated records allowed up to one year ahead, shown as Upcoming, excluded from current balance), Q-11 (no audit trail). Still open: **Q-3** (refunds — record as income for now), **Q-9** (balance adjustments — not built).
Verified: `npm run check` (268 tests incl. `transactions`, `ledger` and `transactions-actions` integration suites: balance changes, transfers and reversals, duplicate submissions incl. races, invalid amounts/dates, edit/delete, stale and concurrent edits, archive-vs-write race, category/type mismatch, ownership, filters, pagination, reconciliation of balances and totals with the ledger); `npm run build`; 170 Playwright tests on desktop, tablet, mobile; screenshots.

### Phase 5 — Financial dashboard ✔ (complete)
Delivered: `features/dashboard` — period resolution (`period.ts`, single definition of every preset in the user's timezone), `getDashboard` running five parallel queries (accounts overview, period cash flow, spending by category, 6-month trend, recent records); income/expenses/net/savings rate per currency (null rate without income); balances today per currency with per-account bars (negative balances grow left); Recharts income-vs-expenses (day/week/month buckets) and monthly-spending columns; HTML bar lists for categories and balances; table view, aria summary and empty state on every chart; currency switcher for charts; period picker (segmented on wide screens, dropdown on phones, custom range form) that keeps the view dimmed while loading; floating add button on phones. Migration `…_dashboard_covering_index` replaces `transactions (user_id, occurred_on DESC)` with a covering index (measured on 400k rows: "this year" 13.6 → 3.0 ms, heap reads 3,371 → 0). Chart colours validated for colour-vision deficiency.
Definitions: PRD §6.12. Not built: Q-2 approximate combined total (no FX); budget and goal cards arrive with Phases 6 and 8.
Verified: `npm run check` (301 tests incl. `dashboard.test.ts` — hand-calculated fixtures with transfers, empty months, multiple accounts, an archived account and two currencies; dashboard totals equal the ledger totals; daily and weekly series sum to the totals — and unit tests for periods, buckets and percentages); `npm run build`; 188 Playwright tests on desktop, tablet, mobile incl. `e2e/dashboard.spec.ts` (period switching updates every widget, empty ranges, custom range, table view, currency switch, link to the ledger); screenshots with seed data.

### Phase 6 — Budget management ✔ (complete)
Delivered: migration `…_budgets` (warning threshold, archive, `budget_alerts` with unique (budget, threshold)); `features/budgets` — usage rules (`usage.ts`: remaining, floored usage > 100 % allowed, statuses, exact threshold checks), month helpers, spent computed in SQL per (category, currency, month), create/edit (optimistic concurrency)/archive/restore/delete, copy last month, month overview with per-currency totals and unbudgeted spending, category spending breakdown with "Set budget" shortcuts; in-app warnings synced after every expense create/edit/delete and budget change (advisory-locked per budget, resolve/re-activate without duplicates) plus reconciliation on view; header bell with unread count, list and mark-read; dashboard "Budgets in <month>" section. Progress bars carry icon + words + pattern for overspending (not colour alone) and a threshold tick; meters expose full text values.
Decisions: Q-8 applied (per currency); monthly periods only (custom periods not justified — PRD §6.7); refunds unchanged (Q-3 open, documented); no email/push.
Verified: `npm run check` (328 tests incl. `budgets.test.ts` — month boundaries, other categories/currencies/users, income and transfers excluded, edits and deletes of expenses, overspending, zero/invalid limits, validation, stale edits, archive/restore/delete, copy, warnings once per threshold incl. concurrent expenses, resolve and silent re-activation, threshold changes, reconciliation — and `budgets-actions.test.ts`); `npm run build`; 203 Playwright tests on desktop, tablet, mobile incl. `e2e/budgets.spec.ts`; screenshots.

### Phase 7 — Recurring income and expenses ✔ (complete)
Delivered: migration `…_recurring` (rule name/status/pause reason/payee, `recurring_runs` history, consistency CHECKs); `features/recurring` — pure calendar engine (`schedule.ts`: from-anchor occurrences, month-end clamping, leap years, intervals, end dates, plain-language description), rule CRUD with explicit catch-up, pause/resume (paused dates skipped), edits affecting only unposted dates, delete keeping posted transactions; execution engine `runDueRules` (due per user timezone, per-rule transaction with `FOR UPDATE SKIP LOCKED`, unique occurrence, atomic next date, bounded batches, archived account/category → paused with reason, safe failure codes, retries, pause after 5 failures, budget warnings synced); schedulers: `/api/cron/recurring` (Bearer `CRON_SECRET`, off by default), `npm run recurring:run`, in-process hourly timer (`RECURRING_SCHEDULER=in-process`, used by the Mac launcher). UI: list with Upcoming (scheduled, not posted) and failures, rule form with live schedule preview and catch-up option, detail with upcoming dates and execution history, transactions show "Posted by Recurring: …". Docs: PRD §6.6, docs/OPERATIONS.md (configuration and recovery).
Decisions (confirmed by the user): Q-4 — due dates post automatically; Q-5 — dates missed while paused are skipped on resume; the earlier "run when the user opens the app" behaviour was removed — posting is scheduled only.
Verified: `npm run check` (359 tests, incl. `recurring-schedule` unit tests — month ends, leap years, intervals, end dates — and `recurring`, `recurring-failures`, `recurring-cron` integration suites: no posting on page reads, month-end posting, leap years, timezone due-ness, retries, concurrent workers, end dates, paused rules and resume, bounded catch-up, archived accounts, budget warnings, edits, deletes, isolation, recorded failures, retry after recovery, pause after repeated failures); `npm run build`; in-process scheduler verified against a running server; 212 Playwright tests on desktop, tablet, mobile incl. `e2e/recurring.spec.ts`; screenshots.

### Phase 8 — Savings goals ✔ (complete)
Delivered: migration `…_savings_goals` (names capped, notes, archive time, idempotent contributions, CHECKs); `features/goals` — progress maths (`progress.ts`: remaining, floored percent > 100 allowed, achieved, overdue, ⌈remaining ÷ months left⌉), goal CRUD with unique names, same-currency optional account, currency fixed after first contribution, optimistic edits, archive/restore/delete; contributions (set aside / take back) under the goal's row lock so saved never goes below zero, idempotent per form submission, removable with the same rule; earmark-exceeds-balance warning per linked account; pages `/goals`, `/goals/new`, `/goals/[id]` (update savings form, history), `/goals/[id]/edit`; dashboard "Savings goals" section.
Decision: Q-7 A (earmarks) — recommended and built on the user's request.
Verified: `npm run check` (380 tests, incl. `goal-progress` unit tests and `goals.test.ts`: balances unchanged, progress/achieved/over-target, monthly amount, withdrawal limit incl. concurrent withdrawals, contribution removal rule, validation, unique names, currency/account rules, archived accounts and goals, double submissions, earmark warning, isolation); `npm run build`; 221 Playwright tests on desktop, tablet, mobile incl. `e2e/goals.spec.ts`; screenshots.

### Phase 9 — Reports and data export ✔ (complete)
Delivered: `features/reports` — periods (9 presets incl. custom, previous-period rules), grouping (auto/day/week/month/year with a row cap), SQL aggregations over the shared ledger relation and WHERE clause (series, category/account breakdowns, account flows), service assembling seven reports; `/reports` page with one URL-based filter bar (folds away on phones), tabs, totals bar with a link to the matching records, charts with table views; currency filter added to the ledger (Transactions filters and URL); CSV export (`/api/transactions/export`, `src/lib/csv.ts`) — BOM, RFC 4180, formula-injection guard, keyset-paginated streaming, 50,000-row limit — with buttons on Reports and Transactions. No schema change. Definitions and limits: docs/REPORTS.md; PRD §5.9 and §6.11 updated (export columns and limit replace the earlier draft, D-8).
Verified: `npm run check` (444 tests, incl. `csv` and `report-period` unit tests, `reports.test.ts` and `export.test.ts`: boundary days, every filter, multiple currencies, reconciliation with Transactions totals, account opening/closing, reversals, budgets, comparison, CSV escaping and injection, batching with date ties, row limit, 3,500-row export, cross-user ids); `npm run build`; 239 Playwright tests on desktop, tablet, mobile incl. `e2e/reports.spec.ts` (downloads checked); screenshots.

### Phase 10 — Settings and UX polish ✔ (complete)
Delivered: migration `…_user_preferences` (date/number format, currency display, budget-warning mode, default warning level + CHECK); `src/lib/format` (date, number and money formatting by preference; per-request preferences on the server via React `cache`, `FormatProvider`/`useFormatPrefs` on the client; `<Money>` reads them); comma-decimal amount input accepted where unambiguous; Settings rebuilt as six sections — Profile (email shown, not editable without verification), Region and display (live preview), Notifications (all / only at the limit / off, re-synced at once; default warning level used by Add budget), Security, Your data (CSV + streamed JSON `/api/me/export`), Delete account (counts, download offer, password + DELETE); default currency pre-selects new accounts; unused exchange-rate field removed (Q-2); `src/i18n` catalog + typed `t()` for shell and shared text (docs/I18N.md); UX/a11y audit — `e2e/audit.spec.ts` (every page × 3 widths: one h1, consistent titles, no sideways scroll, zero axe WCAG 2.2 A/AA violations), fixes: account button name (label in name), keyboard-scrollable tables, not-found h1, alert dialogs scroll on small screens, consistent add/edit titles, record names as tab titles, button sizing; the Add category dialog no longer keeps the previous name and errors when reopened. Hardened e2e select helpers against a lost click during the opening animation.
Verified: `npm run check` (480 tests, incl. `format`, settings schema and money-input unit tests; `settings.test.ts`: persistence, isolation, preferences never alter stored data or balances, warning modes, default level, JSON export contents/secrets/streaming, full account deletion across every table); `npm run build`; full Playwright suite on desktop, tablet, mobile incl. `e2e/settings.spec.ts` and `e2e/audit.spec.ts`; screenshots.

### Phase 11 — Full system QA and security audit ✔ (complete)
Independent audit of the whole repository with reproduced findings — report: [docs/QA_REPORT.md](QA_REPORT.md). 2 P1, 8 P2, 9 P3 found and fixed (timezones the database can't read, archived account edits, goal currency race, future transfer reversals, recurring edits dropping catch-up dates, registration limits, deployment-guide hardening, launcher bound to localhost, and minor items); 0 P0. Added `audit-regressions.test.ts` (16) and an independent `reconciliation.test.ts` (8). Accepted risks R1–R10 listed in the report (Prisma CLI upgrade due on/after 29 Oct 2026).

### Phase 12 — Production deployment (prepared; deployment pending)
Target changed on 18 Oct 2026 to **Netlify + Neon** (US East, Ohio), set up by Claude through connectors: Netlify site `chanly-personal-finance` created, `netlify.toml`, `netlify-build` script and hourly scheduled function committed; waiting for the Neon connector (docs/DEPLOYMENT.md §Netlify). Originally prepared for Vercel (Hobby, `sin1`) + Neon PostgreSQL 17 (Singapore), which remains documented as an alternative. Prepared and verified locally: pre-deployment inspection (build, types, lint, 505 tests, 266 e2e, env vars documented, no secrets in history, Auth.js trusts the Vercel host, generic production errors), `/api/health` reports the deployed commit, release-check suite `npm run release:check` (validated against a local production build: 4/4 checks pass, the two throwaway accounts are deleted even when a check fails), backup and recovery-test scripts (`scripts/backup-db.sh`, `scripts/verify-backup.sh`, validated locally), production runbook in docs/OPERATIONS.md (environments, migrations, backups, recovery, restore, rollback, failed migration, outage, monitoring), README rewritten. Completion review: release checks reduced to two sign-ups per run (production limit 5/IP/hour) with cleanup on failure; `verify-backup.sh` accepts Prisma-style URLs and refuses older local PostgreSQL; `DATABASE_URL` documented with `sslmode=verify-full`; unused placeholder components removed and the dead e2e placeholder test replaced by an "every module is built" check.

**Remaining:** the owner creates the Neon and Vercel projects (docs/DEPLOYMENT.md), then the release checks run against the live address; only then is the deployment reported as done.

### Phase 13 — Hardening and release readiness (done; manual checks listed)
Depends on: all.

Delivered:
- **Performance:** `npm run test:perf` seeds one user with 10,000 records and 1,500 transfers (plus 20,000 other users' records) and times every page's data loading. Dashboard p95 is 15–19 ms against a 500 ms target; the slowest page is 53 ms. `EXPLAIN ANALYZE` shows index scans only, so no index changes were needed.
- **Dark mode:** Settings → Appearance (System / Light / Dark). The choice is kept in a per-browser cookie; a nonce-protected script applies it before first paint (and follows the device for "System"), and the browser bar colour follows the theme. The accessibility sweep runs in dark mode too.
- **Privacy notice:** `/privacy`, linked from the sign-in pages and Settings.
- **Accessibility:**
  - Sweep for a brand-new (empty) account.
  - Duplicate-id check (found and fixed cards sharing an id, so labels pointed at the wrong card).
  - Landmarks on public pages.
- **Security review** (independent, against SECURITY.md / ASVS L2):
  - Sign-out now ends the session on the server and sessions have an absolute 7-day limit (new `auth_sessions` table).
  - Rate-limit keys are keyed hashes.
  - Privacy and security docs corrected.
  - Details are in docs/QA_REPORT.md §Phase 13.
- **Release checklist:** docs/RELEASE_CHECKLIST.md.

Not done here (needs a person or the live site):
- screen-reader pass (VoiceOver);
- Safari and Firefox;
- a real phone;
- deployment checks D1–D4.

## 4. Working method per phase

1. Restate the plan for the phase and confirm any open decisions it depends on.
2. Schema/migration first, then services with integration tests, then actions and UI, then e2e.
3. Run `npm run check` and the relevant e2e specs; fix failures before moving on.
4. Update docs (PRD status, DATABASE, SECURITY, this plan).
5. Report: completed work with verification evidence, outstanding issues, next step.
