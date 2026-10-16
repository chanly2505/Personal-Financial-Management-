@AGENTS.md

# Personal Finance Management System — project guide

## Read first

| Doc | Use it for |
|---|---|
| `docs/PRD.md` | Scope, requirements, **financial rules (§6)**, open decisions (§9) |
| `docs/ARCHITECTURE.md` | Stack, layers and import rules, modules, request flows, ADRs |
| `docs/DATABASE.md` | Schema, money/date storage, constraints, indexes, planned migrations |
| `docs/SECURITY.md` | Auth, authorization layers, validation, headers, logging rules |
| `docs/UI_GUIDELINES.md` | Tokens, layout per device, components, states, accessibility |
| `docs/IMPLEMENTATION_PLAN.md` | Phase order, tasks, exit criteria, known issues |

Do not implement behaviour that depends on an open question (`Q-n` in PRD §9) until it is approved.

## Commands

```bash
npm run dev               # dev server (Turbopack) on :3000
npm run build             # production build
npm run typecheck         # next typegen + tsc --noEmit
npm run lint              # eslint, zero warnings allowed
npm test                  # all Vitest projects (unit + integration)
npm run test:unit         # pure functions, no DB
npm run test:integration  # real PostgreSQL via TEST_DATABASE_URL (auto-migrated; DB name must end in _test)
npm run test:e2e          # Playwright: builds, serves on :3100, desktop + tablet + mobile projects
npm run format            # prettier --write (Tailwind class sorting included)
npm run check             # typecheck + lint + format:check + test — must pass before reporting work as done
npm run db:migrate -- --name <change>   # create & apply a migration (dev DB)
npm run db:deploy         # apply pending migrations (CI/production)
npm run db:generate       # regenerate Prisma client into src/generated/prisma
npm run db:seed           # idempotent demo user + data in the dev DB (password: SEED_DEMO_PASSWORD or printed)
npm run db:studio         # browse the dev database
```

Setup: see README.md (databases, least-privilege app role, AUTH_SECRET, `.env.development` for dev-only mail). Migrations use `MIGRATION_DATABASE_URL` (owner); the app uses `DATABASE_URL` (app role).

Environment notes:
- Cloud container: PostgreSQL does not auto-start — run `service postgresql start`.
- `npm install <pkg>` failing with `Cannot read properties of null (reading 'edgesOut')` is an npm 10 bug: use `npx npm@11 install <pkg>`.
- With a pre-installed Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (e.g. `/opt/pw-browsers/chromium`) instead of `playwright install`.
- If `ui.shadcn.com` is unreachable, add shadcn components by hand from shadcn's source, adapted to our tokens.

## Non-negotiable rules

- **Money:** `bigint` minor units only (`src/lib/money.ts`). Never `number`, `parseFloat`, `toFixed` or `Math.round` on money. Parse with `parseMoney`, display with `formatMoney`, aggregate in SQL or with `sumMinor`. USD exponent 2, KHR exponent 0. Never convert currencies in authoritative figures.
- **Dates:** financial dates are `IsoDate` strings ↔ `DATE` columns via `isoDateToDb`/`dbDateToIso`. "Today" = `todayInTimeZone(user.timezone)`. Never `new Date("YYYY-MM-DD")` in business code.
- **Transfers** are never income or expense; they live in `transfers` and are excluded from income/expense/budget/category totals.
- **Balances** are derived (PRD §6.2), never stored.
- **Authorization:** user id only from the session helpers in `src/server/auth/session.ts` — `requirePageUser()` in pages, `authedAction(schema, handler)` for server actions, `withUser(handler)` for route handlers. Never accept a user id from input. Every repository function takes `userId` and uses it in every `where`. Others' records are "not found". No `userId` in input schemas; no spreading request input into Prisma `data`.
- **Validation:** every server action / route handler re-validates with the module's Zod schema.
- **Atomicity:** multi-row writes in `prisma.$transaction`.
- **Layers:** `app/` composes → `features/<m>/actions.ts` adapts → `server/service.ts` decides → `server/repository.ts` queries. Components never import server code. Server-only files start with `import "server-only"`. Modules call each other's services, never repositories.
- **Security:** no `dangerouslySetInnerHTML`, no `$queryRawUnsafe` outside test helpers, no secrets in code, no amounts/descriptions/emails/tokens in logs.
- **Schema changes:** update `docs/DATABASE.md` (and PRD §6 if a rule changes); hand-written SQL constraints get a test in `tests/integration/schema-constraints.test.ts`. Never edit an applied migration.
- **UI:** token utilities only, `amount` utility on every monetary value, all states handled, destructive actions confirmed (docs/UI_GUIDELINES.md).
- **Next.js 16:** `params`/`searchParams`/`cookies()`/`headers()` are async; `middleware.ts` is `proxy.ts`. Check `node_modules/next/dist/docs/` when unsure.
- **Prisma 7:** import from `@/generated/prisma/client`; only `src/server/db.ts` constructs the client. Run `npm run db:generate` after schema edits.
- **Dependencies:** exact pins; one library per job (ARCHITECTURE §1); justify additions.

## Conventions

- Folders and files kebab-case (`confirm-dialog.tsx`); exported components PascalCase.
- Build UI from existing components first (catalogue: docs/UI_GUIDELINES.md §11, live at `/design-system` in dev). Pages = `PageContainer` → `PageHeader` → content. Money via `<Money>`, forms via `FormField`, deletes via `ConfirmDialog`, outcomes via `toast`.
- Public server actions use `action(schema, handler)` (`src/server/action-result.ts`); protected ones `authedAction(schema, handler)` (`src/server/auth/action.ts`); services throw `DomainError` subclasses from `src/server/errors.ts`; log with `src/server/logger.ts` only.
- Server actions return `ActionResult<T>` (`{ ok: true, data } | { ok: false, error, fieldErrors? }`).
- Copy: sentence case, plain language, no accounting jargon.
- Tests: unit for pure logic; integration for services, constraints and authorization (every service gets a "user B cannot access user A's record" test); e2e for each phase's critical journey on desktop and mobile.

## Definition of done (per feature)

Works on desktop, tablet and mobile · real database data · validation on client and server · authorization enforced and tested · loading/empty/error/success states · automated tests for critical behaviour · `npm run check` passes · docs updated. Never present a placeholder or partial implementation as a working feature.
