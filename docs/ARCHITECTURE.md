# Architecture

A **modular monolith** on Next.js (App Router): one deployable, one PostgreSQL database. Code is organised into feature modules, each owning its UI, validation, business rules and data access, behind clear layer boundaries.

```
Browser
  │  HTML / RSC payloads, Server Action POSTs, CSV download
  ▼
Next.js server ─────────────────────────────────────────────────────────────
  proxy.ts                 optimistic session check → redirect (never the only check)
  app/                     routes & layouts: composition only
  features/<module>/
     components/           UI (server components by default)
     schemas.ts            Zod input schemas, shared by client and server
     actions.ts            "use server" adapters: session → validate → service → revalidate
     server/service.ts     business rules, DB transactions          (server-only)
     server/repository.ts  Prisma queries scoped by userId           (server-only)
  server/                  db client, env, auth, errors              (server-only)
  lib/                     money, dates, utils — pure, framework-free
  ▼
PostgreSQL 16  (Prisma 7 + node-postgres driver adapter)
```

## 1. Stack evaluation

| Concern | Choice | Version | Why | Alternatives considered |
|---|---|---|---|---|
| Framework | **Next.js App Router** | 16.3 | Server Components keep financial data and queries on the server; Server Actions remove a hand-written API layer; one deployable. | Remix/React Router (fine, smaller ecosystem for shadcn), SPA + separate API (two deployables, more surface). |
| Language | **TypeScript**, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` | 5.9 | Type safety end to end, generated Prisma types. | TS 7 native compiler: not yet supported by Next.js tooling. |
| Styling | **Tailwind CSS** | 4.3 | Token-driven utilities; no CSS-in-JS runtime. | CSS Modules (more files, weaker consistency). |
| Components | **shadcn/ui** (Radix base) | CLI 4.x | Accessible primitives copied into the repo — we own and theme them. | MUI/Chakra (heavier, harder to make feel bespoke). |
| Database | **PostgreSQL** | 16 | Transactions, CHECK constraints, composite foreign keys, exact `BIGINT`/`NUMERIC`. | SQLite (weak for concurrent writes in hosted setups), MySQL (fewer constraint features). |
| ORM | **Prisma** | 7.10 | Typed client, migrations, adapters; raw SQL available for constraints and aggregates. | Drizzle (good, but Prisma's migration workflow is more mature for this team size). Prisma 8 is still RC. |
| Authentication | **Auth.js** (`next-auth` v5) | 5 beta, pinned | See ADR-1. | Supabase Auth (rejected, ADR-1). |
| Password hashing | **argon2id** via `@noble/hashes` (pure JavaScript; was `@node-rs/argon2` until Oct 2026) | Phase 2 | OWASP-recommended; no native addon, no runtime WebAssembly. ~0.2–0.4 s per hash; same PHC format, old hashes verify. | — |
| Validation | **Zod** | 4.6 | One schema per input, used by forms and server. | Valibot/Yup (duplicate purpose — not added). |
| Forms | **React Hook Form** + `@hookform/resolvers` | Phase 2 | Uncontrolled inputs, good performance on mobile, integrates with Zod. | Formik (duplicate purpose — not added). |
| Charts | **Recharts** | Phase 5 | Composable React charts, adequate accessibility with table fallbacks. | Chart.js/visx (duplicate purpose — not added). |
| Unit/integration tests | **Vitest** | 4.1 | Fast, TS-native; separate `unit` and `integration` projects. | Jest (duplicate purpose — not added). |
| End-to-end tests | **Playwright** | 1.64 | Desktop + mobile emulation, reliable auto-waiting. | Cypress (duplicate purpose — not added). |

### One library per job

Deliberately **not** added, because something in the stack already covers the need:

| Need | Covered by | Not adding |
|---|---|---|
| Decimal math | `bigint` minor units (`lib/money.ts`) | decimal.js, big.js, dinero.js |
| Dates & timezones | `Intl` + `lib/dates.ts` (calendar dates only) | date-fns, dayjs, luxon, moment |
| Data fetching / client cache | Server Components + Server Actions + URL search params | React Query, SWR, axios |
| Global client state | URL state, React state | Redux, Zustand |
| Toasts | `sonner` (shadcn's toast, added with the first form) | react-hot-toast, react-toastify |
| Icons | `lucide-react` | other icon sets |
| Class names | `clsx` + `tailwind-merge` via `cn()` | classnames |

Dependencies are pinned to exact versions. A new dependency needs a one-line justification in the pull request.

## 2. Authentication decision (ADR-1)

**Decision: Auth.js v5 with the Credentials provider (email + password) and encrypted JWT session cookies, with our own `users` table.**

Reasons:
- Self-hosted: no external identity service; works with any PostgreSQL host; user data stays in our database.
- First-class Next.js App Router integration (`auth()` in server components, actions and `proxy.ts`).
- Room to add OAuth providers later without changing the session model.

Trade-offs and mitigations:
- Auth.js v5 is published under a `beta` tag. → Pin the exact version; wrap it behind `server/auth/` so the rest of the code calls only `requireUser()`/`getSession()`.
- Credentials requires JWT sessions, which cannot be revoked individually. → `users.session_version` is embedded in the token and checked against the database on every authenticated request; password change and "sign out everywhere" increment it. Session lifetime 7 days, refreshed daily.
- Auth.js does not provide registration, password hashing or rate limiting for Credentials. → Implemented in `features/auth` (SECURITY.md §2–3).

Rejected: **Supabase Auth** — ties the identity provider and, in practice, the database host to Supabase; duplicates Prisma's role for data access if Supabase client libraries are used; adds a second source of user records.

Only one authentication implementation will exist in the codebase.

## 3. Layers and boundaries

| Layer | Location | May import | Must not |
|---|---|---|---|
| Routes / layouts | `src/app` | features (components, actions, services for reads), components, lib | contain business rules or Prisma calls |
| UI components | `src/components`, `features/*/components` | lib, components, module `schemas.ts`/`types.ts`, actions (client forms) | import `server/` code or Prisma |
| Server actions | `features/*/actions.ts` | own module's service & schemas, `server/auth` | contain business rules or queries |
| Services | `features/*/server/service.ts` | own repository, other modules' **services**, lib, `server/errors` | import other modules' repositories |
| Repositories | `features/*/server/repository.ts` | `server/db`, generated Prisma types | omit `userId` from any user-data query |
| Infrastructure | `src/server` | lib, generated Prisma client | import features |
| Pure helpers | `src/lib` | nothing app-specific | import React, Next or Prisma |

All files under `server/` start with `import "server-only"`, so a mistaken client import fails the build. Layer rules are enforced by ESLint (`eslint.config.mjs`): UI/shared code cannot import `@/server/*` or feature `server/` code, only `src/server/**` and feature repositories may import Prisma, and `dangerouslySetInnerHTML` / unsafe raw SQL are errors.

## 4. Feature modules

| Module | Folder | Responsibility | Owns tables | Depends on (services) |
|---|---|---|---|---|
| Authentication & profile | `features/auth`, `features/settings` | Registration, sign-in, sessions, password change, rate limiting, profile & preferences, account deletion | `users`, `auth_rate_limits` (Phase 2) | categories (seed defaults) |
| Accounts | `features/accounts` | Account CRUD/archival, derived balances (the one read-only aggregate over `transactions`/`transfers`, in its repository) | `accounts` | — |
| Categories | `features/categories` | Category CRUD/archival, default seed | `categories` | — |
| Transactions | `features/transactions` | Income/expense and transfer CRUD, history, filters, CSV export | `transactions`, `transfers` | accounts, categories |
| Dashboard | `features/dashboard` | Read-only composition of other modules | — | accounts, transactions, budgets, goals |
| Budgets | `features/budgets` | Monthly limits, spent/remaining | `budgets` | categories, transactions |
| Recurring | `features/recurring` | Rules, schedule computation, idempotent execution | `recurring_rules` | accounts, categories, transactions |
| Savings goals | `features/goals` | Goals, contributions, progress | `savings_goals`, `savings_contributions` | accounts |
| Reports | `features/reports` | Date-range aggregations for charts and tables | — | transactions, categories |

Naming: folders and files kebab-case (`confirm-dialog.tsx`, `action-result.ts`, matching shadcn); exported components PascalCase; server actions are verbs (`createTransaction`); services expose `get*`, `list*`, `create*`, `update*`, `delete*`.

## 5. Directory layout

`✔` = exists now; `[Phase n]` = added in that phase.

```
src/
  app/
    layout.tsx, globals.css          ✔ root layout (fonts, TooltipProvider, Toaster), design tokens
    page.tsx                         ✔ public landing (signed-in users → /dashboard)
    not-found.tsx, global-error.tsx  ✔ 404 page; last-resort error boundary
    (app)/layout.tsx                 ✔ app shell; requirePageUser() — authoritative page guard
    (app)/loading.tsx, error.tsx     ✔ default skeleton and error boundary for every module
    (app)/dashboard|transactions|accounts|categories|budgets|recurring|goals|reports|settings/
                                     ✔ every module built (Phases 3–10)
    (dev)/design-system/             ✔ component reference (dev; prod only with ENABLE_DESIGN_SYSTEM_PAGE)
    (auth)/sign-in, register, forgot-password, reset-password  ✔ public auth pages
    api/health/route.ts              ✔ database liveness probe
    api/auth/[...nextauth]/route.ts  ✔ Auth.js handlers
    api/me/route.ts                  ✔ caller's own profile (withUser)
    api/me/export/route.ts           ✔ caller's full data as JSON (Settings → Your data)
    api/transactions/export/route.ts ✔ CSV export, streamed (docs/REPORTS.md)
    api/cron/recurring/route.ts      ✔ scheduled jobs (Bearer CRON_SECRET)
  proxy.ts                           ✔ optimistic redirect + per-request CSP nonce
  components/ui/                     ✔ shadcn/ui primitives (UI_GUIDELINES §11)
  components/layout/                 ✔ app shell, sidebar, mobile nav, header, page header/container, navigation.ts
  components/shared/                 ✔ FormField, SelectField, MoneyInput, EmptyState, ErrorState, ConfirmDialog, Money
  features/accounts, features/categories     ✔ schemas, types, actions, components, server/{service,repository}
  features/transactions/server              ✔ ledger, entries, transfers, CSV export
  features/categories/default-categories.ts  ✔ defaults shared by registration and the local seed
  features/<module>/...              see §3
  server/db.ts, env.ts               ✔ Prisma client, validated environment
  server/errors.ts, action-result.ts ✔ DomainError types; ActionResult + action() wrapper
  server/logger.ts, health.ts        ✔ privacy-safe JSON logger; DB health check
  server/auth/                       ✔ config (Auth.js), session (getCurrentUser/requireUser/requirePageUser),
                                     action (authedAction), password, rate-limit, client-ip
  server/http.ts, mail.ts            ✔ route-handler auth wrapper + JSON errors; email transport
  features/auth, features/settings   ✔ schemas, actions, components, server/{service,repository}
  lib/money.ts, dates.ts, utils.ts   ✔ pure helpers
  lib/config.ts                      ✔ public, non-secret app config (name, description)
  generated/prisma/                  generated client (git-ignored)
prisma/schema.prisma, migrations/, seed.ts, sql/app-role.sql   ✔
tests/unit, tests/integration, tests/helpers ✔
e2e/                                         ✔ desktop, tablet, mobile projects
docs/                                        ✔
```

There is deliberately no `src/server/repositories` or `src/server/services` folder: business services and repositories live with their feature (`features/<m>/server/`), and `src/server/` holds only cross-cutting infrastructure. This keeps each module self-contained without an extra abstraction layer.

## 6. Request flows

**Read** — Server Component → `requireUser()` → service → repository → Prisma → DTO → render. DTOs are plain serialisable objects (`bigint` amounts are supported by React's RSC serialisation; dates as `IsoDate` strings).

**Mutation** — Client form (React Hook Form + module Zod schema) → server action:
1. `requireUser()` — user id from the session, never from input.
2. `schema.safeParse(input)` — always re-validated on the server.
3. Service — applies the financial rules (PRD §6); multi-row writes in `prisma.$transaction`.
4. `revalidatePath()` for affected routes.
5. Return `ActionResult<T>` = `{ ok: true, data } | { ok: false, error, fieldErrors? }`. Expected failures are values; unexpected errors are logged without financial details and shown as a generic message.

**Route handlers** only where a URL is required: Auth.js, CSV download, scheduled job.

**Scheduled work** — recurring execution runs lazily per user on app load and from a daily job calling `api/cron/recurring` with a secret header (scheduler depends on the deployment target, Q-14). Both paths call the same idempotent service.

## 7. Cross-cutting concerns

- **Authorization:** three layers — see SECURITY.md §4.
- **Financial integrity:** money as `bigint` minor units, derived balances, transfers in their own table, unique recurring occurrences, atomic writes. Rules in PRD §6; storage in DATABASE.md.
- **Errors:** services throw `DomainError` subclasses (`NotFoundError`, `ValidationError`, `ConflictError`, `UnauthorizedError`, `RateLimitedError` in `server/errors.ts`). Server actions are wrapped with `action(schema, handler)` (`server/action-result.ts`), which validates input and converts every failure into an `ActionResult`; unexpected errors are logged via `server/logger.ts` and shown as a generic message. Rendering errors hit `(app)/error.tsx` or `global-error.tsx`.
- **Caching:** authenticated pages are dynamic and per-user; no shared cache holds financial data; `cacheComponents` stays off.
- **Configuration:** `server/env.ts` validates environment variables at startup with Zod.
- **Firebase (client SDK):** `lib/firebase/config.ts` reads the public `NEXT_PUBLIC_FIREBASE_*` config (null = disabled), `lib/firebase/client.ts` creates the browser app once (`getFirebaseApp()`), and `components/providers/firebase-init.tsx` in the root layout initializes it. No Analytics. PostgreSQL and Auth.js remain the source of truth for data and sign-in; Firebase services (e.g. Cloud Messaging for reminders) are added on top when a phase needs them.
- **Observability:** JSON-line logs from `server/logger.ts` (time, level, event, ids, durations, error class) with no financial content; `/api/health` reports database reachability only.

## 8. Testing strategy

| Layer | Tool / command | Covers |
|---|---|---|
| Unit | `npm run test:unit` | money, dates, schedule computation, schemas, CSV escaping |
| Integration | `npm run test:integration` (real PostgreSQL, DB name must end `_test`, auto-migrated) | services, repositories, constraints, authorization (user B cannot read/change user A's data), reconciliation of dashboard/report totals |
| End-to-end | `npm run test:e2e` (production build, desktop + Pixel 7 projects) | critical journeys per phase |

## 9. Architecture decision records

- **ADR-1** Auth.js Credentials + JWT with session version (§2).
- **ADR-2** Integer minor units instead of `DECIMAL` for money; `DECIMAL(12,4)` only for the display exchange rate.
- **ADR-3** Transfers in a separate table, so they cannot leak into income/expense totals.
- **ADR-4** Derived balances, no stored balance column; revisit only with measured need, and then with a reconciliation test.
- **ADR-5** Prisma 7 (stable) over Prisma 8 (RC).
- **ADR-6** Composite `(id, user_id)` foreign keys so the database rejects cross-user links.
- **ADR-7** Calendar dates as `DATE` interpreted in the user's timezone; no timestamps for financial events.
