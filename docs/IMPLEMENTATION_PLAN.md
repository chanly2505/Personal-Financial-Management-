# Implementation Plan

Phases are ordered by dependency: each phase only builds on modules finished before it. A phase is finished only when its exit criteria pass — see the Definition of Done in `CLAUDE.md`. Open questions (`Q-n`) are defined in [PRD §9](PRD.md#9-decisions-needing-approval).

## 1. Current state

The project lives in `/home/user/personal-finance`. Phases 0–6 are complete.

**Present and verified (end of Phase 6)**
- Next.js 16.3.8 + React 19.2 + TypeScript 5.9 (strict) + Tailwind CSS 4; ESLint (with layer-boundary rules) and Prettier.
- Prisma 7.10 schema with 9 tables and the initial migration (with hand-written CHECK constraints), applied to `finance_dev` and `finance_test`; idempotent local seed (`npm run db:seed`).
- Validated environment (`src/server/env.ts`), error model (`src/server/errors.ts`, `action-result.ts`), privacy-safe logger, `/api/health` database probe.
- Design tokens and 20 UI primitives, 6 shared components, the responsive app shell, module placeholders, loading/error/not-found boundaries, and a `/design-system` reference page.
- Authentication & authorization (Phase 2): Auth.js credentials + JWT sessions with database-checked session versions, argon2id, DB-backed rate limits, password change/recovery, sign-out-everywhere, account deletion, profile settings, nonce CSP and security headers, least-privilege DB role.
- Accounts & categories (Phase 3): CRUD, archive/restore, delete-when-unused, derived balances, per-currency totals, account history, category type rules.
- Transactions (Phase 4): income/expense/transfer CRUD, transfer reversal, idempotent creates, optimistic edits, row-locked writes, ledger with search/filters/sort/pagination and per-currency totals.
- Dashboard (Phase 5): period filter (6 presets incl. custom), per-currency income/expenses/net/savings rate, balances today with account breakdown, income-vs-expenses, spending-by-category and monthly-spending charts with table views, recent transactions; server-side aggregation with an index-only covering index.
- Budgets (Phase 6): monthly per-category, per-currency limits with live spent/remaining/usage from expense records, configurable warning threshold, archive/restore/delete, copy last month, month navigation, category spending breakdown, in-app warnings (header bell) without duplicates, dashboard budget section.
- Firebase client SDK initialized (no Analytics).
- `npm run check` passes (typecheck, lint, format check, 328 Vitest tests); 203 Playwright tests pass on desktop, tablet and mobile against a production build.

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

### Phase 7 — Recurring income and expenses
Depends on: Phase 4. Decisions: **Q-4** (automatic vs confirm), **Q-5** (pause behaviour). Needs **Q-14** for the scheduler (lazy catch-up works without it).

Tasks: rule CRUD, pause/resume, schedule computation (anchor-based, clamped), idempotent execution service, lazy catch-up on app load, `api/cron/recurring` with `CRON_SECRET`, auto-pause on archived account/category, delete detaches history.

Exit criteria: unit tests for schedules (month-end, leap years, intervals, end dates); integration tests for exactly-once execution under concurrent runs, catch-up cap, pause/resume, rule edits not touching history; e2e create rule dated today → entry appears once after reload.

### Phase 8 — Savings goals
Depends on: Phase 3 (accounts); dashboard card depends on Phase 5. Decision: **Q-7** (goal model).

Tasks: goal CRUD, contributions (+/−, cannot go below zero), progress, achieved state, required monthly saving, earmark-exceeds-balance warning, dashboard card.

Exit criteria: progress and withdrawal rules tested; authorization; e2e create goal → contribute → progress shown.

### Phase 9 — Reports
Depends on: Phases 4, 6. 

Tasks: date-range picker with presets; income vs. expenses by month per currency; by-category breakdowns; table views with the same numbers; link to filtered history and CSV export.

Exit criteria: report totals equal history totals for identical filters (integration); timezone month boundaries; charts have accessible table alternatives; e2e on all three widths.

### Phase 10 — Hardening and release readiness
Depends on: all. Decision: **Q-14** (deployment target).

Tasks: accessibility audit (keyboard, screen reader, contrast) and fixes; performance with 10,000+ seeded records (`EXPLAIN ANALYZE`, index review); full security review against SECURITY.md; dark-mode toggle; error/empty state review; deployment configuration (env, migrations on deploy, scheduler, backups); privacy notice.

Exit criteria: PRD §7 non-functional targets met and measured; no high/critical runtime audit findings; release checklist signed off.

## 4. Working method per phase

1. Restate the plan for the phase and confirm any open decisions it depends on.
2. Schema/migration first, then services with integration tests, then actions and UI, then e2e.
3. Run `npm run check` and the relevant e2e specs; fix failures before moving on.
4. Update docs (PRD status, DATABASE, SECURITY, this plan).
5. Report: completed work with verification evidence, outstanding issues, next step.
