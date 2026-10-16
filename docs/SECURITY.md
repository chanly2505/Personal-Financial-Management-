# Security

Reference standard: **OWASP ASVS 4.0 level 2** and the OWASP Top 10. This document defines the security boundaries every phase must respect. Items marked *(Phase n)* are designed here and implemented in that phase; everything else in §2–§9 is implemented and tested (see §13).

## 1. Assets, actors and threats

| Asset | Why it matters |
|---|---|
| Financial records (amounts, descriptions, accounts, goals) | Highly personal; reveal income, habits, location of money |
| Credentials and sessions | Grant full access to the above |
| `AUTH_SECRET`, `DATABASE_URL`, `CRON_SECRET` | Compromise = forge sessions / read the database / trigger jobs |

| Actor | Main threats |
|---|---|
| Anonymous internet user | Credential stuffing, brute force, account enumeration, injection, scraping |
| Authenticated user | Accessing or changing another user's records (IDOR), mass assignment, CSV injection against an accountant |
| Attacker with a stolen session cookie | Continued access after the victim changes password |
| Compromised dependency | Code execution on the server |

Explicitly **not** handled by the app because it never holds them: bank passwords, PINs, card numbers, payment credentials. The app never asks for them, and any input field that could tempt users (e.g. account "notes") carries help text saying not to enter them.

## 2. Authentication (implemented, Phase 2)

| Concern | Implementation | Code |
|---|---|---|
| Provider | Auth.js v5 (`next-auth@5.0.0-beta.32`, pinned), Credentials provider, our `users` table. JWT session strategy (required by Credentials); no Auth.js database adapter, because there are no OAuth accounts or database sessions to store. One authentication implementation only. | `src/server/auth/config.ts` |
| Password storage | argon2id via `@node-rs/argon2` — 19 MiB memory, 2 iterations, 1 lane (OWASP minimum); per-hash salt in the PHC string. Hashes using older parameters are transparently upgraded at the next successful sign-in. Plaintext passwords are never stored, logged or returned. Auth.js deliberately leaves credential verification to the app; we use an established hashing library rather than custom crypto. | `src/server/auth/password.ts` |
| Password policy | 10–128 characters, not only whitespace; no composition rules (NIST SP 800-63B). Policy is shown on registration and password change, never revealed on sign-in. | `src/features/auth/schemas.ts` |
| Email | Trimmed and lower-cased before storage and lookup; a CHECK constraint enforces it in the database. | schemas + migration |
| Enumeration resistance | Sign-in: identical "Email or password is incorrect." for wrong password and unknown email, plus a dummy argon2 verification for unknown emails so timing matches. Recovery: identical response whether or not the email exists. Registration of a taken email: generic "We couldn't create an account with these details…" — registration inherently reveals existence without email verification; this is rate limited and accepted until Q-12. | `src/features/auth/server/service.ts` |
| Session cookie | Encrypted JWT (JWE, A256CBC-HS512 keyed from `AUTH_SECRET`); `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` + `__Secure-` prefix whenever served over HTTPS (set `AUTH_URL` to the https origin in production). 7-day lifetime, re-issued at most daily while in use. The token holds only user id, name/email and `sv` (session version). | `src/server/auth/config.ts` |
| Session verification | Every protected request runs `getCurrentUser()` → decodes the cookie → loads the user → compares `users.session_version` with the token's `sv`. Missing user or mismatch = signed out. Memoised per request. | `src/server/auth/session.ts` |
| Revocation | `session_version` is incremented by sign-out-everywhere, password change and password reset, invalidating every previously issued cookie immediately. Rotating `AUTH_SECRET` invalidates all sessions (incident response). Expired or tampered cookies fail decryption and are treated as signed out. | service + session |
| Sign-out | Server action clears the cookie via Auth.js and redirects to sign-in. | `src/features/auth/actions.ts` |
| Password change | Requires the current password (rate limited per user); revokes all sessions including the current one; the user signs in again. | `src/features/settings/actions.ts` |
| Password recovery | Supported when an email transport is configured. 32-byte random token (base64url) emailed as a link; only its SHA-256 hash is stored; 30-minute expiry; single use (all of the user's tokens are deleted on use or re-request); success revokes all sessions. `MAIL_TRANSPORT=none` (default and production until Q-12) hides the feature and returns 404 for its pages. `console` (development only — refused in production by env validation) prints the link to the terminal. | `src/server/mail.ts`, service |
| Account deletion | Requires the current password and typing `DELETE`; deletes the user and, via `ON DELETE CASCADE`, every row they own; signs out. | service + settings actions |
| Redirect safety | `callbackUrl` accepts only same-origin in-app paths (no absolute, protocol-relative, backslash, control-character, API or auth-page targets). | `src/lib/safe-redirect.ts` |

## 3. Abuse protection (implemented, Phase 2)

Fixed-window counters in PostgreSQL (`auth_rate_limits`), updated with a single atomic upsert so limits hold across concurrent requests and multiple server instances. Keys are SHA-256 hashes of `scope:subject` — raw emails and IPs are never stored.

| Scope | Limit | Behaviour when exceeded |
|---|---|---|
| Sign-in per email | 5 attempts / 15 min (cleared by a successful sign-in) | "Too many attempts…" — even with the right password |
| Sign-in per IP | 20 / 15 min | same |
| Registration per IP | 5 / hour | same |
| Reset request per IP | 10 / hour | same |
| Reset request per email | 3 / hour | silently no email (response unchanged — no enumeration) |
| Reset submission per IP | 10 / hour | "Too many attempts…" |
| Current-password checks per user (change password, delete account) | 5 / 15 min | "Too many attempts…" |

- Limits run inside the services, and sign-in limiting runs inside Auth.js `authorize`, so they also cover direct POSTs to `/api/auth/callback/credentials`, not just the UI.
- Client IP comes only from `TRUSTED_IP_HEADER` (the header your platform sets). When unset, IP-based limits are skipped rather than trusting spoofable headers; email- and user-based limits still apply. **Set it in every deployment.**
- `pruneRateLimits()` removes windows that ended over a day ago (to be scheduled with the Phase 7 job).
- No CAPTCHA in v1.

## 4. Authorization and data ownership

Three independent layers; a bug in one is caught by the next.

1. **Routing** — `src/proxy.ts` redirects requests for protected pages without a session cookie to sign-in (optimistic, cheap; never redirects *away* from auth pages, so stale cookies cannot loop). The `(app)` layout calls `requirePageUser()`, which fully verifies the session and redirects with a safe `callbackUrl`. The proxy is never relied on alone.
2. **Application** — the user id comes only from the session. Protected server actions are built with `authedAction(schema, handler)` (`src/server/auth/action.ts`), which checks the session *before* validating input, so anonymous callers learn nothing; protected route handlers use `withUser(handler)` (`src/server/http.ts`). Every repository function takes `userId` and includes it in every `where` (`{ id, userId }` for single records; `updateMany`/`deleteMany` with `userId` so a foreign id affects zero rows). Records owned by another user produce the same "not found" response as non-existent ones. Input schemas never accept `userId`, and services build Prisma `data` objects explicitly (no spreading of request input → no mass assignment).
3. **Database** — composite foreign keys `(parent_id, user_id)` make cross-user links impossible (DATABASE.md §5), proven by `tests/integration/schema-constraints.test.ts`.

**Consistent unauthorized / forbidden responses**

| Context | Not signed in | Signed in, not allowed | Someone else's record |
|---|---|---|---|
| Page | redirect to `/sign-in?callbackUrl=…` | — | `notFound()` → the same not-found page as an unknown id. Pages under the shared loading skeleton stream, so the HTTP status is 200 with a `noindex` not-found body; the content is identical either way (no existence leak). |
| Server action | `{ ok: false, code: "UNAUTHORIZED", error: "Please sign in to continue." }` | `code: "FORBIDDEN"` (`ForbiddenError`) | `code: "NOT_FOUND"` |
| Route handler | `401 { error: { code: "UNAUTHORIZED", message } }` | `403 { error: { code: "FORBIDDEN", … } }` | `404 { error: { code: "NOT_FOUND", … } }` |

All error bodies have the same shape and `Cache-Control: no-store`; none include internal details.

**Required test for every service:** user B attempting to read, update, delete or reference user A's record fails with "not found" and changes nothing.

There is no admin role and no support access to financial data in v1.

## 5. Input validation and output encoding

- Every server action and route handler validates input with the module's Zod schema on the server, regardless of client validation. Unknown keys are stripped.
- IDs are validated as UUIDs before reaching the database.
- Money parsed with `parseMoney` (strict format, bounds); dates with `isIsoDate` and the allowed range (PRD §6.5); timezones with `isValidTimeZone`; text fields trimmed with maximum lengths (names 60, descriptions 200).
- SQL: Prisma queries or `$queryRaw` tagged templates only. `$queryRawUnsafe`/`$executeRawUnsafe` are forbidden outside test helpers.
- HTML: React escaping only; `dangerouslySetInnerHTML` is forbidden.
- CSV: formula-injection neutralisation (PRD §6.11); `Content-Disposition: attachment`; `Content-Type: text/csv; charset=utf-8`.

## 6. CSRF

- Server Actions: Next.js accepts them only via POST and compares the `Origin` header with the host; `serverActions.allowedOrigins` stays empty unless a deployment requires it.
- Auth.js routes use its built-in CSRF token.
- State-changing route handlers are not used; the CSV export is a read-only GET; the cron endpoint requires a secret header and is not callable from browsers with cookies alone.

## 7. HTTP security headers (implemented, Phase 2)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (+ `upgrade-insecure-requests` over HTTPS, + `'unsafe-eval'` in `next dev` only). Fresh nonce per request from `src/proxy.ts`; every page renders dynamically (root layout calls `connection()`) so the nonce reaches Next.js's scripts. `unsafe-inline` styles are needed for Radix positioning and toasts. |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (production only) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `X-Powered-By` | removed (`poweredByHeader: false`) |
| `X-Frame-Options` | `DENY` (legacy browsers; CSP covers modern ones) |

Fonts are self-hosted by `next/font` at build time, so no third-party origins are needed at runtime.

### Public and diagnostic endpoints

| Endpoint | Exposure | Rule |
|---|---|---|
| `/api/health` | Public | Returns only `{status, database}` up/down; no versions, hostnames or error text; `Cache-Control: no-store`. |
| `/design-system` | Development; production only if `ENABLE_DESIGN_SYSTEM_PAGE=true` (used by e2e) | Renders static sample strings, no user data; must stay disabled in deployed environments. |
| `/api/me` | Signed-in users | Returns only the caller's own profile; no id parameter exists. |
| `/api/auth/*` | Public (Auth.js) | CSRF-protected by Auth.js; credentials callback is rate limited inside `authorize`. |

## 8. Secrets and configuration

- All secrets come from environment variables, validated in `src/server/env.ts`; the app refuses to start if a required one is missing or malformed.
- `.env*` files are git-ignored except `.env.example`, which documents every variable with placeholder values only.
- No secrets in source, tests, logs, error messages or client bundles. Only variables prefixed `NEXT_PUBLIC_` reach the browser, and none are secret (there are none in v1).
- Development database credentials in `.env.example` are local-only placeholders and must never be used in a deployed environment.
- Development-only settings (`MAIL_TRANSPORT=console`) live in `.env.development`, which `next build`/`next start` never load; env validation also refuses `console` in production.

### Least-privilege database access (implemented, Phase 2)

| Role | Used by | Privileges |
|---|---|---|
| `finance` (owner) | `MIGRATION_DATABASE_URL`: Prisma migrate/studio, test and e2e harnesses | Owns the schema |
| `finance_app` | `DATABASE_URL`: the running app and the seed | `SELECT, INSERT, UPDATE, DELETE` on tables; no `CREATE` on the schema; cannot alter or drop tables; no access to `_prisma_migrations` |

`prisma/sql/app-role.sql` creates the role and grants (re-runnable; default privileges cover future tables). Verified: as `finance_app`, `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE` and reading `_prisma_migrations` all fail with permission errors. Row-level security is not used: authorization is enforced by the application (§4) plus composite foreign keys; RLS would be the next hardening step if a second application ever shared the database.

## 9. Logging, errors and privacy

- Logs contain: timestamp, level, event name, ids, duration, error class. Auth events (`auth.registered`, `auth.rate_limited`, `auth.password_changed`, …) carry no email, IP or token.
- Logs never contain: amounts, descriptions, account or category names, emails, passwords, tokens, cookies, full request bodies.
- Users see friendly messages; stack traces and database errors are never sent to the browser (`error.tsx` boundaries, generic action errors).
- No third-party analytics, trackers or session-replay tools. The Firebase SDK is initialized in the browser (`src/lib/firebase/`) **without** Google Analytics: no `measurementId`, `getAnalytics()` is never called, and initialization alone makes no network requests (verified: no external requests, CSP unchanged). Its web config values are public identifiers, read from `NEXT_PUBLIC_FIREBASE_*`; any Firebase service added later must update the CSP and this section.
- `next dev` would print every server action call with its arguments (passwords, amounts); this is disabled with `logging.serverFunctions: false` in `next.config.ts`.
- The development-only `console` mail transport prints reset links (which contain tokens) to the terminal by design; it is refused in production.

## 10. Data protection

- Transport: HTTPS only in production (HSTS).
- At rest: rely on the database host's encryption at rest (deployment decision, PRD Q-14). No application-level field encryption in v1 — the threat it would address (database dump without app secrets) is covered by host controls and backups policy.
- Backups: daily automated database backups with tested restore, retention 30 days (deployment decision).
- Deletion: account deletion removes all user rows immediately; backups age out within the retention period (stated in the privacy notice).

## 11. Dependencies and supply chain

- Exact version pins and a committed lockfile; `npm ci` in CI.
- `npm audit --omit=dev` reviewed each phase; high/critical issues in runtime dependencies block release. Current known findings: `mysql2` and `deepmerge-ts` pulled in by the Prisma CLI (dev tool, not shipped in the app runtime) — tracked until Prisma ships an update.
- New dependencies require justification (ARCHITECTURE §1); prefer well-maintained packages with few transitive dependencies.

## 12. Security verification per phase

Each phase's exit criteria include:
1. Authorization tests for every new service (user B vs. user A).
2. Validation tests for every new schema (boundaries and malformed input).
3. `npm run check` and `npm audit --omit=dev` reviewed.
4. A security review of the phase's diff (Claude Code `/security-review` or manual) with findings fixed or recorded.
5. This document updated if a boundary changed.

## 13. Phase 2 security tests

| Requirement | Tests |
|---|---|
| Registration & sign-in succeed; hashes are argon2id, never plaintext | `tests/integration/auth-service.test.ts` · `e2e/auth.spec.ts` "registers, signs out, and signs back in" |
| Invalid credentials; identical messages for unknown email / wrong password | auth-service "accepts the right password…" · e2e "does not reveal whether an email is registered" |
| Rate limiting (per email, per IP, per user) and hashed keys | auth-service "locks an email…", "limits attempts per IP…", "stores only hashed rate-limit keys", "limits current-password guesses" · e2e "locks sign-in for an email…" |
| Logout and session invalidation (sign-out-everywhere, password change, reset, deleted user) | `tests/integration/session.test.ts` · e2e "sign out everywhere ends sessions on other devices", "changing the password revokes every session" |
| Session expiry, tampering, wrong secret | `tests/unit/session-token.test.ts` · e2e "a forged or expired session cookie is treated as signed out" |
| Unauthenticated access to every protected page and API | e2e "unauthenticated access" (9 pages + `/api/me`) · `tests/integration/authorization.test.ts` |
| User A cannot read or modify user B's data | authorization.test.ts (client-supplied `userId` ignored, cannot delete or re-password B, DB rejects cross-user links) · e2e "each user sees and changes only their own profile" |
| Missing/invalid authorization returns consistent errors without leaking validation details | authorization.test.ts "rejects anonymous server actions before validating" and "consistent 401 JSON body" |
| Password recovery single-use, hashed, expiring, revoking | auth-service "password recovery" block |
| Open-redirect protection | `tests/unit/safe-redirect.test.ts` · e2e "ignores off-site callback URLs" |
| Security headers and cookie flags | e2e "security headers" block |
| Accounts & categories: ownership, validation, currency rules (Phase 3) | `tests/integration/accounts.test.ts`, `categories.test.ts`, `accounts-categories-actions.test.ts` · `e2e/accounts.spec.ts` "another user's account is not found" |
| Transactions: anonymous callers rejected before validation; client-supplied owner ignored; another user's accounts, categories, records and transfers are "not found" for read, edit, delete and reverse (Phase 4) | `tests/integration/transactions-actions.test.ts`, `transactions.test.ts` "never edits or deletes another user's records", "cannot reverse another user's transfer", `ledger.test.ts` "never shows another user's records" · `e2e/transactions.spec.ts` "another user's record is not found" |
| Budgets: anonymous actions rejected before validation; owner is the session user; another user's budgets, categories and alerts are not found / not changed; spent never includes another user's records (Phase 6) | `tests/integration/budgets-actions.test.ts`, `budgets.test.ts` "never counts another user's expenses", "never lets another user change…", "marks alerts read, only the user's own" |
| Recurring: owner-only rules; engine posts only into the owner's account/category (composite FKs); cron endpoint disabled without `CRON_SECRET`, constant-time bearer check, returns counts only; failure logs and history carry no amounts, names or raw errors (Phase 7) | `tests/integration/recurring.test.ts` "never exposes or changes another user's rules", `recurring-cron.test.ts`, `recurring-failures.test.ts` "records a safe reason…" · `e2e/recurring.spec.ts` "rejects requests without the secret" |
| Savings goals: owner-only goals and contributions; linked account must be the owner's (composite FK + service); another user's goals are not found for read, contribute, remove, archive or delete (Phase 8) | `tests/integration/goals.test.ts` "never shows or changes another user's goals" |
| Ledger search input is parameterised and LIKE wildcards are escaped; invalid filter params are dropped | `ledger.test.ts` "searches … literally", "ignores invalid filter values" |
