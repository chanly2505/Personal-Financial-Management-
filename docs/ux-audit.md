# UX and accessibility audit

Phase 1 of the production-readiness audit (19 Oct 2026, commit `4afa2ad`). This is a code review focused on what automated checks miss; the app already passes axe sweeps on every page in light and dark mode (docs/QA_REPORT.md). Users are non-technical and often not native English speakers. Every proposed change is the smallest one that keeps the existing design system. No code was changed.

## Findings

### UX-1: A failed connection while saving shows no message, and the "Set aside" button can spin forever
- **Severity:** High.
- **Evidence:**
  - `src/features/transactions/components/transaction-form.tsx:187-209` awaits the server action with no `catch`.
  - `src/features/goals/components/contribution-form.tsx:54-63`: `setPending(true); const result = await addContributionAction(...); setPending(false);`. If the request throws, `setPending(false)` never runs (confirmed by reading the code).
  - `src/components/shared/confirm-dialog.tsx:60-63` uses `try/finally` with no `catch`.
  - Only the recurring and appearance forms catch errors.
- **User impact:**
  - On a weak mobile connection, the user taps Save and either nothing explains what happened or the button keeps spinning.
  - They cannot tell whether the record was saved, so they may enter it again. The request-id protection prevents a duplicate for transactions, but the user doesn't know that.
- **Recommended fix:** Add one small client helper that turns a thrown request into `{ ok: false, error: "We couldn't reach the server. Check your connection and try again. What you typed is kept." }`. Use it in the transaction, contribution and other forms, and in `ConfirmDialog`.
- **Acceptance criteria:** With the network set to offline in DevTools, every form shows the message inline, keeps what was typed, and the button becomes usable again. Retrying after reconnecting saves once.

### UX-2: The dashboard puts "how much money do I have" last
- **Severity:** Medium.
- **Evidence:** `src/app/(app)/dashboard/page.tsx:465`: "Balances today" comes after the period tiles, four charts, budgets and goals (lines 222-463).
- **User impact:** On a phone, the most-asked question is several screens down.
- **Recommended fix:** Move the self-contained balances section above the period section.
- **Acceptance criteria:**
  - On a 360 px phone, the total per currency is visible without scrolling.
  - The heading order still makes sense.
  - The e2e tests are updated.

### UX-3: Errors that need action appear only in toasts that disappear after 4 seconds
- **Severity:** Medium.
- **Evidence:**
  - `src/components/ui/sonner.tsx`: `duration={4000}`.
  - There are 15 `toast.error(result.error)` calls, e.g. `src/features/accounts/components/account-actions.tsx:24`.
  - The account-archive refusal is about 35 words (`src/features/accounts/server/service.ts:169`), and the dialog closes.
  - This contradicts docs/UI_GUIDELINES.md §8: toasts never carry information the user must act on.
- **User impact:** A second-language reader cannot finish the message before it vanishes.
- **Recommended fix:** Let `ConfirmDialog` show a returned error inline (`FormAlert`) and stay open. For other errors, make error toasts stay until dismissed.
- **Acceptance criteria:** Archiving an account that still has money keeps the dialog open with the explanation visible until the user closes it.

### UX-4: A forgotten password is a dead end
- **Severity:** Medium.
- **Evidence:**
  - With `MAIL_TRANSPORT=none`, the "Forgot password?" link is hidden with no alternative (`src/features/auth/components/sign-in-form.tsx:55`).
  - The registration conflict message still says "sign in or reset your password" (`src/features/auth/server/service.ts:35`).
- **User impact:** A locked-out user gets no guidance, and one message points to a feature that doesn't exist.
- **Recommended fix:** While recovery is off, show "Forgot your password? Ask the person who runs this app to reset it." Drop "or reset your password" from the registration message. Pair this with PROD-7.
- **Acceptance criteria:** With mail off, the sign-in page explains what to do, and no message mentions a reset that cannot happen.

### UX-5: Phone keypads cannot type the minus sign the opening balance asks for
- **Severity:** Medium.
- **Evidence:**
  - `src/components/shared/money-input.tsx:22`: `inputMode` is `numeric` or `decimal`.
  - `src/features/accounts/components/account-form.tsx:179-180`: "Use a minus sign if it's overdrawn."
  - iPhone number pads have no minus key.
- **User impact:** Phone users cannot enter an overdrawn starting balance as instructed.
- **Recommended fix:** Add an `allowNegative` option to `MoneyInput` that uses a text keypad, only for the opening balance.
- **Acceptance criteria:** A negative opening balance can be entered on an iPhone, and other amount fields keep the number pad.

### UX-6: "Mark all read" in the warnings menu cannot be reached by keyboard
- **Severity:** Medium.
- **Evidence:** `src/features/budgets/components/alerts-menu.tsx:64-72` puts a plain `<button>` inside `DropdownMenuLabel` (confirmed by reading the code). Radix menus move focus only between menu items, and Tab closes the menu.
- **User impact:** Keyboard and switch users can never mark warnings as read.
- **Recommended fix:** Make it a `DropdownMenuItem` with `onSelect`.
- **Acceptance criteria:** With the menu open, the arrow keys reach "Mark all read", and Enter marks all warnings read.

### UX-7: Finance jargon beyond what docs/UI_GUIDELINES.md §1.3 allows
- **Severity:** Medium.
- **Evidence:**
  - "Net cash flow" and "Savings rate" (`dashboard/page.tsx:87,91`).
  - "cash flow" (`reports/page.tsx:57`).
  - "Opening balance" (`account-form.tsx:174`).
  - "earmark" (`dashboard/page.tsx:443`, `goals/page.tsx:30`).
  - "occurrences … post on the next scheduled run" (`recurring-form.tsx:292-298`).
- **User impact:** Non-native speakers may not understand key numbers.
- **Recommended fix (wording only):**

  | Current | Proposed |
  |---|---|
  | Net cash flow | Left over (income − spending) |
  | Savings rate | Share of income kept |
  | Opening balance | Starting balance |
  | earmarked | set aside (your balances don't change) |
  | occurrences | past dates |
  | post on the next scheduled run | are added within the hour |

- **Acceptance criteria:** These terms no longer appear in user-facing text, and the tests are updated.

### UX-8: Some contrast is below WCAG minimums
- **Severity:** Medium.
- **Evidence:** Computed from the OKLCH tokens in `src/app/globals.css`:
  - Input borders are 1.43:1 (light) and about 1.63:1 (dark) against cards. Form controls need 3:1 (WCAG 1.4.11).
  - Dark-mode error text on its tinted background is 4.47:1; text needs 4.5:1.
  - The dark-mode expense chart colour is 2.78:1.
  - All other text tokens pass (4.5:1 or better).
- **User impact:** Low-vision users may not see where fields are, or may struggle with error text in dark mode.
- **Recommended fix:**
  - Light `--input` ≈ `oklch(0.64 0.01 255)` (3.36:1); dark `--input` ≈ white at 30%.
  - Dark `--destructive` ≈ `oklch(0.70 0.18 25)` (4.83:1).
  - Dark `--chart-expense` ≈ L 0.55 (3.46:1), then re-check that income and expense colours stay distinguishable for colour-blind users.
- **Acceptance criteria:** Fields meet 3:1 and text meets 4.5:1. The axe sweep includes a dark-mode page with a form error shown.

### UX-9: Touch targets are smaller than the project's own 40 px rule
- **Severity:** Low.
- **Evidence:**
  - `src/components/ui/button.tsx`: default `h-9` (36 px), small `h-8`, icon `size-9`.
  - Inputs are `h-9`, and the period presets are `h-8`.
  - Bottom-nav labels are `text-[11px]` (`mobile-nav.tsx:25`).
- **User impact:** Mis-taps on phones.
- **Recommended fix:** Add `max-md:h-10` (40 px) to buttons and inputs on small screens, and use `text-xs` for nav labels.
- **Acceptance criteria:** At 360 px wide, every tappable control is at least 40×40 px.

### UX-10: The dashboard heading outline is misleading for screen readers
- **Severity:** Low.
- **Evidence:** Chart card titles render as `<div>` (`card.tsx:31`, `chart-card.tsx:33`), while empty states inside cards render as `<h2>` (`empty-state.tsx:24`).
- **User impact:** Heading navigation lists "No spending in this period" as a section, and the chart titles not at all.
- **Recommended fix:** Render chart card titles as `h3`, and use level 3 for empty states inside cards.
- **Acceptance criteria:** The headings read h1 → h2 sections → h3 card titles.

### UX-11: Filter results are not announced, and Apply shows no progress
- **Severity:** Low.
- **Evidence:** `ledger-filters.tsx:68` calls `router.push` without a pending state, and the "N records match" text is not a live region.
- **User impact:** Screen-reader users don't hear the result. Everyone gets no feedback on a slow connection.
- **Recommended fix:** Use `useTransition` and the button's loading state, and add `role="status"` to the count.
- **Acceptance criteria:** "12 records match" is announced after Apply, and the button shows it is busy while loading.

### UX-12: A single-letter shortcut ("n") with no way to turn it off
- **Severity:** Low (WCAG 2.1.4).
- **Evidence:** `src/features/transactions/components/new-transaction-shortcut.tsx:11` reacts to the plain `n` key.
- **User impact:** Speech-input users can trigger it by accident.
- **Recommended fix:** Require a modifier key (Alt+N), or add a setting to turn it off.
- **Acceptance criteria:** A plain letter key never navigates.

### UX-13: The amount field's currency is not announced, and the chart axis ignores format settings
- **Severity:** Low.
- **Evidence:**
  - The currency prefix is `aria-hidden` (`money-input.tsx:19`).
  - The chart y-axis uses a fixed `en-US` compact format with no currency (`charts.tsx:36`).
- **User impact:** A screen reader says "Amount" without the currency, which changes with the account. The axis format can differ from the user's chosen format.
- **Recommended fix:** Include the currency in the accessible name, e.g. "Amount (KHR)". Pass the user's formatting preferences to the axis.
- **Acceptance criteria:** A screen reader says "Amount, KHR", and axis labels follow the user's number format.

### UX-14: Required-field markers are inconsistent
- **Severity:** Low.
- **Evidence:**
  - `form-field.tsx:47` shows an unexplained `*`, while forms also mark "(optional)" fields.
  - The sign-in form has no markers; the register form does.
- **User impact:** Unclear which fields are needed.
- **Recommended fix:** Keep the plainer "(optional)" convention, and drop the visual asterisk while keeping `aria-required`.
- **Acceptance criteria:** One convention is used everywhere.

### UX-15: Chart summaries are read twice by screen readers
- **Severity:** Low.
- **Evidence:** `charts.tsx` has both `aria-label={summary}` and a screen-reader-only `<figcaption>{summary}</figcaption>`.
- **User impact:** Repetition.
- **Recommended fix:** Keep one of them.
- **Acceptance criteria:** Each summary is read once.

## Strengths to keep

- **Accessible forms:** `FormField` wires `aria-describedby`, `aria-invalid` and `aria-required`, and focus moves to the first server-side error (`src/lib/form-errors.ts`).
- **No duplicate records:** pending buttons and one-time request ids protect transactions, contributions and reversals.
- **Safe destructive actions:** confirmation dialogs name the item and start focus on Cancel. Deleting your own account requires typing a phrase.
- **Accessible shell:** skip link, focusable `main`, reduced-motion support, `role="alert"` on errors, and route-level `loading.tsx` and `error.tsx`.
- **Charts have text alternatives:** "Show as table" with captions, plain-HTML ranked lists, and no chart animation.
- **Clear helper text in many places:** "Transfers between your accounts are not counted", "Each currency is totalled separately and never converted", local examples (ABA, ACLEDA, Wing).
- **Money display:** amounts always go through `Money`, with a sign as well as a colour, and KHR has no decimals.
- **One component family:** one Button, Card, Dialog and FormField set, with no duplicates.
