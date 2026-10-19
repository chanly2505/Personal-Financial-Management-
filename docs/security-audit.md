# Security audit

Phase 1 of the production-readiness audit (19 Oct 2026, commit `4afa2ad`). Read-only review of every server action, route handler, protected page and repository query; no code was changed. See also docs/SECURITY.md (design) and docs/QA_REPORT.md (accepted risks R1–R12).

**Result:** no Critical or High defects. Authentication, per-user query scoping, IDOR protection, input validation, error handling, redirect safety and CSV-injection protection are consistent and backed by database constraints. The findings are configuration and hardening items.

## Findings

### SEC-1: Per-IP rate limits depend on Railway's `X-Real-IP` not being spoofable (unverified)
- **Severity:** Medium.
- **Evidence:**
  - `src/server/auth/client-ip.ts:15-21` reads the header named by `TRUSTED_IP_HEADER` (`x-real-ip` on Railway) and accepts any IP-shaped value.
  - docs/DEPLOYMENT.md notes "community reports say it is not guaranteed spoof-proof".
  - The shared no-IP registration budget applies only when no IP is present (`src/features/auth/server/service.ts:86-87`).
- **User impact:** If a client can set `X-Real-IP` itself, rotating the value removes the per-IP limits on sign-in (password spraying across many emails), registration and reset. The per-email limit (5 per 15 minutes) still protects each individual account.
- **Recommended fix:**
  1. Test it on the live site with a dedicated test account, not real users: send a forged `X-Real-IP` and check whether the per-IP limit still triggers.
  2. Whatever the result, add global ceilings that do not depend on the IP: total registrations per hour, and total failed sign-ins per window.
- **Acceptance criteria:**
  - 21 sign-in attempts with different emails and rotating forged `X-Real-IP` values are refused.
  - Registrations above the global hourly cap are refused whatever the headers.

### SEC-2: The public deployment allows anyone to register
- **Severity:** Medium.
- **Evidence:**
  - docs/QA_REPORT.md:167: "No-go for a public, open-registration service until: e-mail verification…".
  - There is no registration switch or allowlist in `src/server/env.ts`, and `registerAction` (`src/features/auth/actions.ts:60-64`) is open.
- **User impact:**
  - Anyone can create accounts on your database: storage and CPU use, and a larger attack surface.
  - Registration tells a caller whether an email already exists (accepted risk R3).
  - With no password recovery (PROD-7), real users who forget a password are stuck.
- **Recommended fix:** Add `REGISTRATION_MODE=open|allowlist|closed` (with `REGISTRATION_ALLOWLIST`). When it is not open, `/register` returns 404 and `registerAction` refuses.
- **Acceptance criteria:**
  - In allowlist mode an allowlisted email can register and any other email cannot.
  - In closed mode `/register` returns 404.
  - Existing users are unaffected.

### SEC-3: `/api/auth/session` still answers for a revoked session
- **Severity:** Low.
- **Evidence:**
  - The `jwt` and `session` callbacks in `src/server/auth/config.ts:70-85` never check the database.
  - Revocation (the session row and `session_version`) is checked only in `resolveSessionUser` (`src/server/auth/session.ts:41-65`), which every page, action and API route uses.
  - Nothing in the app calls `/api/auth/session`.
- **User impact:** A stolen cookie that was revoked still returns the user's name and email from this one endpoint. It cannot read any financial data.
- **Recommended fix:** In the `jwt` callback, re-check the session row and return `null` when it is gone. Alternatively, return 404 for `GET /api/auth/session`.
- **Acceptance criteria:** After "sign out everywhere", the old cookie gets an empty session from `/api/auth/session`.

### SEC-4: More than one live deployment shares the database
- **Severity:** Low as a code issue (the operational side is PROD-1, High).
- **Evidence:**
  - docs/DEPLOYMENT.md records a live Cloudflare deployment on the same Neon database.
  - Rate-limit keys are HMAC'd with a key derived from `AUTH_SECRET` (`src/server/auth/rate-limit.ts:133-137`).
- **User impact:** If the deployments use different `AUTH_SECRET`s, each counts attempts separately, so the per-email limit multiplies.
- **Recommended fix:** Keep exactly one deployment (PROD-1).
- **Acceptance criteria:** Only Railway serves the production database.

### SEC-5: Non-UUID ids in page URLs cause a server error instead of "not found"
- **Severity:** Low (no data exposure).
- **Evidence:**
  - `src/app/(app)/transactions/[id]/page.tsx:38-43` passes the raw `id` to `getRecord` and turns only `NotFoundError` into `notFound()`. The same pattern is used for accounts, goals, recurring and budgets.
  - **Confirmed by running it:** `prisma.transaction.findFirst({ where: { id: "abc", … } })` throws `PrismaClientKnownRequestError P2007`, so `/transactions/abc` renders the error page (HTTP 500) and logs an error.
  - docs/SECURITY.md §5 claims "IDs are validated as UUIDs before reaching the database". That holds for actions, not pages.
- **User impact:** A mistyped or truncated link shows "Something went wrong" instead of "Not found", and adds error-log noise.
- **Recommended fix:** In each `[id]` page, check the id with a shared `isUuid` helper and call `notFound()` when it fails.
- **Acceptance criteria:** `/accounts/abc`, `/transactions/abc`, `/goals/abc`, `/recurring/abc` and `/budgets/abc/edit` show the not-found page, and no error is logged. Add an e2e or integration test.

### SEC-6: Misleading comment on comma-separated IP headers
- **Severity:** Low (hardening).
- **Evidence:** `src/server/auth/client-ip.ts:18-19` takes the first entry of a comma list ("the platform appends the real client first"). Proxies append on the right, so the leftmost entry is client-controlled.
- **User impact:** None with `x-real-ip`. If `TRUSTED_IP_HEADER=x-forwarded-for` were ever set, the IP limits could be bypassed trivially.
- **Recommended fix:** Reject values that contain a comma, and document that only single-value headers set by the edge are supported.
- **Acceptance criteria:** A unit test shows that a comma list returns no IP.

### SEC-7: No CSP on API responses and prefetch requests
- **Severity:** Info.
- **Evidence:** The `src/proxy.ts:82-91` matcher skips `/api/*` and prefetch requests.
- **User impact:** Negligible. API responses are JSON or attachments with `nosniff`, and pages still get the nonce CSP.
- **Recommended fix:** Optionally add a static `default-src 'none'; frame-ancestors 'none'` header for `/api/:path*` in `next.config.ts`.
- **Acceptance criteria:** API responses carry the restrictive CSP.

### SEC-8: AUTH_URL pinning (resolved during this session)
- **Severity:** Info.
- **Evidence:** `AUTH_URL=https://personal-financial-management-production-c29c.up.railway.app` was set on Railway on 19 Oct 2026, alongside `AUTH_TRUST_HOST=true`.
- **User impact:** None; auth redirects use the canonical address.
- **Recommended fix:** Keep it in sync if a custom domain is added.
- **Acceptance criteria:** Not applicable.

### SEC-9: No Row Level Security (defence-in-depth assessment)
- **Severity:** Info.
- **Evidence:**
  - The app role `finance_app` (`prisma/sql/app-role-neon.sql`) has SELECT, INSERT, UPDATE and DELETE on every table, for all users' rows.
  - Isolation is enforced in application code (every query has `user_id`). Composite foreign keys prevent cross-user writes and links, but not reads.
- **Assessment:**
  - The brief's Supabase RLS requirement applies when a database is exposed directly to browsers (PostgREST/Data API). Here only the server connects, so RLS is not required and was never "disabled as a workaround".
  - The residual risk is that a future query forgets `user_id`. Today none does: this audit grepped every repository and every raw SQL statement, and the integration tests in `tests/integration/authorization.test.ts` cover cross-user access.
- **Recommended fix:**
  - Confirm the Neon Data API is not enabled for the project.
  - Optionally `ALTER ROLE finance_app SET statement_timeout = '15s'` and set a connection limit. This needs owner authorization; a prepared migration would be reviewed first.
  - Reconsider RLS only if a second database client is ever added.
- **Acceptance criteria:** The Data API is confirmed off. If the role settings are applied, they appear in `pg_roles`.

### SEC-10: npm audit
- **Severity:** Info.
- **Evidence:** `npm audit --omit=dev`: 8 high, 0 critical.
  - All 8 are in `prisma@7.10.0` CLI dependencies (`deepmerge-ts`, `mysql2`; fixed in 7.10.1) and `@opennextjs/cloudflare` → `glob` (CLI only).
  - None is reachable from a request.
- **User impact:** None in production today.
- **Recommended fix:** Upgrade Prisma to 7.10.1 on or after 29 Oct 2026 (QA_REPORT R1). Removing the Cloudflare adapter (PROD-9) clears the glob advisory.
- **Acceptance criteria:** `npm audit --omit=dev` shows no high findings.
- **Already documented:** yes, QA_REPORT R1 and R12.

### SEC-11: Minor notes
- **Severity:** Info.
- **Notes:**
  - Sessions last 7 days with no idle timeout (`src/server/auth/config.ts:15`). Consider an idle limit for a finance app.
  - docs/SECURITY.md says there are no `NEXT_PUBLIC_` variables, but the Firebase public identifiers exist. They are not secrets; the doc is just inconsistent.
  - Password-reset timing could reveal registered emails. Reset is off in production.
- **Recommended fix:** Correct the docs; decide on an idle timeout.
- **Acceptance criteria:** Not applicable.

## Verified correct (with evidence)

**Authentication is enforced server-side, independent of navigation:**
- All 49 server actions use `authedAction` (`src/server/auth/action.ts:21-35`), which checks the session before validating input. The exceptions are the public auth actions and the theme cookie.
- All 23 `(app)` pages and their layout call `requirePageUser()`.
- API routes use `withUser` (`src/server/http.ts:44-58`).
- The cron route uses `timingSafeEqual` and is off without `CRON_SECRET`.
- A session needs a live `auth_sessions` row and a matching `session_version` (`src/server/auth/session.ts:41-65`).

**Per-user authorization and IDOR:**
- Every repository query filters by `userId` or `user_id`. That includes updates, deletes and raw SQL joins.
- Account, category, goal and budget ids supplied by the client are re-checked for ownership before use (`transactions/server/service.ts:110-116`, `categories/server/service.ts:137-154`, `goals/server/service.ts:143-153`).
- No schema accepts a `userId` from the client.
- Composite foreign keys (`user_id` included) make a cross-user link impossible even if code were wrong.
- Covered by `tests/integration/authorization.test.ts` and `audit-regressions.test.ts`.

**Secrets stay on the server:**
- Server modules import `server-only`, and secrets are read only through `src/server/env.ts`.
- No secret has a `NEXT_PUBLIC_` name.
- Only `.env.example` is tracked in git.

**Input validation:**
- Every action is validated with zod.
- Money is parsed from a string of at most 32 characters into exact integer minor units, with the currency's decimals and a maximum (`src/lib/money.ts:80-118`).
- Dates are ISO dates with range checks; enums cover currency, type and frequency; text has length limits; ids are UUIDs.
- No `$queryRawUnsafe` in app code, and no `dangerouslySetInnerHTML`.

**Errors and logs:**
- Actions return only domain or validation messages, or a generic message (`src/server/action-result.ts:36-55`).
- Error pages show only a digest.
- In production the logger records only the error class, ids and counts (`src/server/logger.ts`), and server-function argument logging is off.
- I found no passwords, tokens or transaction details in logs.

**Auth flows:**
- Argon2id (19 MiB, t=2) with constant-time comparison and dummy verification for unknown emails.
- Reset tokens: 32 random bytes, stored as SHA-256, expire after 30 minutes, single use, and all sessions are revoked on reset.
- Password change and account deletion require the current password.
- Sign-out deletes the session row; "sign out everywhere" bumps `session_version`.

**Rate limiting and CSRF:**
- Atomic, HMAC-keyed counters, applied inside `authorize`, so direct POSTs to the Auth.js callback are covered.
- Server actions get Next.js's Origin check; Auth.js uses its CSRF token; exports are GET-only with no CORS headers.

**Headers and redirects:**
- Nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP.
- `safeCallbackPath` blocks open redirects.
- CSV cells are neutralised against formula injection.

**Database role:**
- `finance_app` has no SUPERUSER, CREATEDB or CREATEROLE, no CREATE on `public`, and no access to `_prisma_migrations`.
- The seed script refuses to run in production.

## Database changes

None are required for the findings above. SEC-9's optional role settings would be prepared as a reviewed SQL file with a rollback (`ALTER ROLE finance_app RESET statement_timeout`) and applied only with explicit approval. No RLS changes are proposed, and RLS is not being disabled anywhere.
