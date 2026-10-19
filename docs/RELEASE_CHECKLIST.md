# Release checklist

Phase 13 exit criterion. Each item is either **verified** (with the evidence: a command or test that ran and passed) or **manual** (needs a person or a deployed site — not claimed until someone has done it). Re-run the automated items before every release.

## Automated — run before every release

| # | Check | How | Last result (Phase 13) |
|---|---|---|---|
| A1 | Types, lint (0 warnings), formatting | `npm run check` | pass |
| A2 | Unit and integration tests, incl. reconciliation and audit regressions | `npm run check` | 513 passed |
| A3 | Production build | `npm run build` (also run by `npm run test:e2e`) | pass |
| A4 | End-to-end on desktop, tablet and phone; accessibility sweep (WCAG 2.2 A/AA rules, duplicate ids) on every page, in light and dark, for a new and a filled account | `npm run test:e2e` | 307 passed, 0 failed, 11 skipped |
| A5 | Performance: page data loading with 10,000 records < 500 ms p95 (PRD §7) | `npm run test:perf` | dashboard p95 15–19 ms; slowest page 53 ms; CSV of 11,500 rows 282 ms |
| A6 | Dependencies | `npm audit` | only accepted R1 (Prisma CLI) and R11 (lint tool) |
| A7 | No secrets in the repository | `git log -p \| grep` for keys; `.env` ignored | clean |

## After deploying — against the live site

| # | Check | How | Status |
|---|---|---|---|
| D1 | Health shows the deployed commit | open `/api/health` | manual — pending deployment |
| D2 | Release checks (sign-up, sign-in, money flows, balances, budgets, reports, CSV, isolation, phone layout, headers, scheduled job) | `RELEASE_URL=… RELEASE_CRON_SECRET=… npm run release:check` | manual — pending deployment |
| D3 | Scheduled job ran | Railway logs: `recurring.run_finished` within the hour | manual — pending deployment |
| D4 | First backup and restore test | `scripts/backup-db.sh`, `scripts/verify-backup.sh` (docs/OPERATIONS.md) | manual — pending deployment |

## Manual — needs a person

| # | Check | How | Status |
|---|---|---|---|
| M1 | Screen reader pass | macOS VoiceOver (⌘ + F5) in Safari: sign in; add an account; add an expense with a wrong amount first (the error must be read out); open the dashboard and use "Show as table"; change a setting and hear the confirmation; open and close the delete dialog with the keyboard. Every control must have a sensible name and focus must never get lost. | not done |
| M2 | Other browsers | Latest Safari and Firefox on the Mac, Safari on an iPhone (iOS 17+): sign in, add a transaction, dashboard, reports, dark mode | not done (only Chromium is installed in the test environment) |
| M3 | Real phone | The live site on your own phone: layout, keyboard covering fields, number entry | not done |
| M4 | Privacy notice | Read `/privacy`; add a contact if others will use the site | not done |

## Known and accepted

See docs/QA_REPORT.md: accepted risks R1–R11, and "What was NOT verified".
