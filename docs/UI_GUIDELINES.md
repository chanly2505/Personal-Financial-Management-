# UI Guidelines

Premium, minimal, calm. Financial display rules (signs, rounding, currencies) come from [PRD §6](PRD.md#6-financial-rules). The product handles people's money: every screen should feel trustworthy, legible and quiet. When in doubt, remove.

## 1. Principles

1. **Numbers first.** Amounts are the most important content. They get size, weight and alignment; chrome stays out of the way.
2. **One primary action per screen.** Secondary actions are outline/ghost buttons or menu items.
3. **Plain language.** "Money in / Money out / Move money", not "credit / debit / journal". Write for someone who has never used finance software.
4. **Never colour alone.** Income/expense colour is always paired with a sign, label or icon.
5. **Every state designed.** Loading, empty, error, success and over-limit states are part of the feature, not extras.
6. **No decoration.** No gradients, illustrations or charts that do not answer a question. Motion only to explain a change, and respect `prefers-reduced-motion`.

## 2. Design tokens

Defined once in `src/app/globals.css` (light `:root`, dark `.dark`), exposed to Tailwind via `@theme inline`. **Use token utilities only** (`bg-card`, `text-muted-foreground`, `text-income`); never hard-code hex/oklch values or Tailwind palette colours like `text-green-600` in components. The live reference is the `/design-system` page (available in development).

### Colour

| Group | Token | Use |
|---|---|---|
| Neutral | `background` / `foreground` | Page surface and default text |
| Neutral | `card` / `card-foreground`, `popover` | Raised surfaces: cards, tables, dialogs, menus |
| Neutral | `muted` / `muted-foreground` | Subtle fills (skeletons, tab lists); secondary text and captions (≥ 4.5:1) |
| Neutral | `border`, `input` | Dividers and control borders |
| Primary | `primary` / `primary-foreground` | Primary buttons, active navigation, links, focus ring |
| Secondary | `secondary`, `accent` (+ `-foreground`) | Secondary buttons, hover rows and menu highlights |
| Success | `success` / `success-muted` | Saved, achieved, completed (non-monetary) |
| Warning | `warning` / `warning-muted` | Approaching a limit, needs attention |
| Danger | `destructive` / `destructive-muted` | Errors and destructive actions only — **not** for expenses |
| Info | `info` / `info-muted` | Neutral notices, "Not available yet", approximations |
| Finance | `income`, `expense`, `transfer` (+ `-muted`) | Amount direction text and badges |
| Data | `chart-1` … `chart-6` | Categorical chart series in order; group extra series into "Other" (`chart-6`) |
| Shell | `sidebar-*` | Sidebar surface, active item and focus |

The `-muted` variant is the background for a badge or alert whose text uses the base token; each pair meets 4.5:1.

### Shape, elevation, focus

| Token | Utility | Use |
|---|---|---|
| `--radius` (0.625rem) | `rounded-sm/md/lg/xl` | `md` controls, `lg` popovers/alerts, `xl` cards and dialogs |
| `--shadow-xs` | `shadow-xs` | Controls (inputs, outline buttons) |
| `--shadow-sm` | `shadow-sm` | Rarely; prefer border + `shadow-xs` on cards |
| `--shadow-md` | `shadow-md` | Popovers, menus, select lists, tooltips, toasts |
| `--shadow-lg` | `shadow-lg` | Dialogs and sheets |
| `--ring` | `focus-visible:ring-[3px] ring-ring/50` + `border-ring` | Every interactive element's keyboard focus. Never remove without a replacement. |
| invalid | `aria-invalid:border-destructive` | Built into inputs, selects, date input, textarea |

### Layout tokens

| Token | Utility | Value | Use |
|---|---|---|---|
| `--container-page` | `max-w-page` | 76rem | Lists, dashboards (default `PageContainer`) |
| `--container-content` | `max-w-content` | 48rem | Reading pages, not-found |
| `--container-form` | `max-w-form` | 32rem | Single-form pages |
| `--spacing-sidebar` | `w-sidebar`, `pl-sidebar` | 15rem | Desktop sidebar |
| `--spacing-rail` | `w-rail`, `pl-rail` | 4.5rem | Tablet icon rail |
| `--spacing-header` | `h-header` | 3.5rem | Top bar |
| `--spacing-bottom-nav` | `h-bottom-nav` | 4rem | Phone bottom navigation |

Breakpoints are Tailwind's defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280 px.

Dark mode is class-based (`.dark` on `<html>`); the toggle ships in Phase 10 (until then the light theme is used).

## 3. Typography

Font: Geist Sans (`font-sans`). Use the scale below; do not invent sizes.

Scale (Tailwind defaults): `text-xs` 12px · `text-sm` 14px · `text-base` 16px · `text-lg` 18px · `text-2xl` 24px · `text-3xl` 30px. Inputs use `text-base` on phones (prevents iOS zoom) and `md:text-sm` above.

| Role | Classes |
|---|---|
| Page title (h1) | `text-2xl font-semibold tracking-tight` (`sm:text-3xl` on landing only) |
| Section title (h2) | `text-lg font-semibold` |
| Card title | `text-base font-semibold` (`CardTitle`) |
| Body | `text-sm` (app), `text-base` (marketing/long text) |
| Caption / helper | `text-xs text-muted-foreground` or `text-sm text-muted-foreground` |
| Hero amount (dashboard totals) | `text-3xl font-semibold amount` |
| Table/list amount | `text-sm font-medium amount` |

`amount` is a custom utility: tabular numerals + no wrapping. Apply it to **every** monetary value.

## 4. Layout and spacing

- Spacing scale: Tailwind's 4px grid. `gap-2` within a control group, `gap-4` between related items, `gap-6` between cards and page sections (`gap-8` at `lg`), `p-6` inside cards.
- Every page: `PageContainer` (gutters `px-4 sm:px-6`, vertical rhythm, max width) → `PageHeader` (one `h1`, description, optional breadcrumbs and actions) → content.
- App shell (`src/components/layout/app-shell.tsx`), by device class:

  | Width | Device | Navigation | Content |
  |---|---|---|---|
  | < 768 px | Phone | Top bar with brand; fixed bottom navigation (Dashboard, Transactions, Accounts, Budgets, More); remaining modules in a bottom "More" sheet | Single column; tables become stacked lists |
  | 768–1023 px | Tablet | Icon rail; labels are screen-reader text and tooltips | Two-column card grids; essential table columns |
  | ≥ 1024 px | Desktop | Full sidebar with labels | Up to three-column layouts; full tables |

  The quick "Add" action joins the phone bottom bar when transactions exist (Phase 4).
- Breadcrumbs only on nested pages (e.g. Accounts › ABA Savings); top-level pages have none.
- Design at 360 px first. No horizontal page scroll at any width (checked by e2e on every module page).
- Touch targets ≥ 40×40 px on mobile; bottom navigation respects the safe-area inset.

## 5. Amounts and status

- Always render with `<Money minor currency tone>` (`src/components/shared/money.tsx`), which uses `formatMoney` from `src/lib/money.ts`. Tones: `income` (+, green), `expense` (−, red), `transfer` (unsigned, neutral), `neutral` (balances; negatives turn red). Never format with `toFixed` or string concatenation.
- USD: `$1,234.56`. KHR: `៛410,000` (no decimals). Show the currency code when a screen mixes currencies and the symbol might be ambiguous.
- Direction: income `+$12.00` in `text-income`; expense `-$12.00` in `text-expense`. The sign carries the meaning; colour only reinforces it. Transfers use `text-transfer` with a "Transfer" badge and no sign.
- Balances: plain `text-foreground`; negative balances show the minus sign and `text-expense`.
- Approximate converted totals are prefixed "≈" and labelled "approx." with the rate in a tooltip.
- Budget status: < 80% neutral, 80–100% `warning` badge "Almost at limit", > 100% `expense` badge "Over by $X". Progress bars include the percentage as text.

## 6. Dates

- Display: `15 Oct 2026` in lists; `Today`, `Yesterday` for the two most recent days; month headings `October 2026`.
- Inputs use `DateInput` (`src/components/ui/date-input.tsx`), a styled native `<input type="date">`: every platform's own accessible, localised picker, no dependency, and its value is already an ISO calendar date. Default to today in the user's timezone. The input displays dates in the browser's locale format; stored and submitted values are always `YYYY-MM-DD`.
- Never show times for financial events — they are calendar dates.

## 7. Forms

- React Hook Form + the module's shared Zod schema. Validate on blur and on submit; re-validate on change after the first error.
- Every input has a visible `<Label>`; placeholders are examples, not labels.
- Amount fields: `type="text" inputMode="decimal"` (KHR: `inputMode="numeric"`), currency shown as a prefix adornment, `autoComplete="off"`.
- Error messages say what to do: "Enter an amount greater than zero." — not "Invalid input". Messages come from the Zod schema / `parseMoney` so client and server agree.
- Associate errors with `aria-describedby` and set `aria-invalid`. On submit failure, focus the first invalid field.
- Submit buttons show a pending state (`disabled` + "Saving…") and prevent double submission.
- After success: close the dialog / navigate, and confirm with a short toast ("Expense added").

## 8. States

| State | Pattern |
|---|---|
| Loading | `loading.tsx` with `Skeleton` shapes matching the final layout (the `(app)` group has a default). No spinners for page loads; `Button loading` for in-place actions. |
| Empty | `EmptyState`: one-line title, one sentence of help, one primary action ("Add your first account"). No illustrations. |
| Error | `ErrorState` via `(app)/error.tsx` (shell stays usable) and `global-error.tsx` (root failures): plain message, "Try again", optional reference digest; never stack traces. Inline form problems use `Alert variant="destructive"`. |
| Not found | `app/not-found.tsx` (404 status), or `notFound()` from a page. Also used for records owned by other users. |
| Success | `toast.success("Expense added")` from `sonner`; 4 s, top-centre, polite live region. |
| Not yet built | `PlannedFeature` (via `ModulePlaceholder`): "Not available yet — planned for phase N". No fake data or controls. |
| Destructive | `ConfirmDialog` naming the thing: "Delete 'Groceries – 12 Oct'? This cannot be undone." Destructive button on the right, focus starts on Cancel. Deleting a user account requires typing a confirmation phrase. |

## 9. Accessibility (WCAG 2.2 AA)

- Text contrast ≥ 4.5:1 (≥ 3:1 for large text and UI boundaries). Tokens are tuned for this — do not lower opacity on text.
- All functionality works with keyboard only; visible focus ring (`ring` token, 3 px) on every interactive element; logical tab order; dialogs trap focus and restore it on close.
- Landmarks: one `<main>`, `<nav aria-label>`, `<header>`. One `h1` per page.
- Icons are `aria-hidden` when decorative; icon-only buttons have `aria-label`.
- Charts have a text alternative: a visually-hidden or toggleable data table with the same numbers.
- Respect `prefers-reduced-motion` (handled globally in `globals.css`).

## 10. Charts

- Use only when a chart answers a question better than a number or table: trend over time (bar/line), share of spending (horizontal bar preferred over pie).
- Colours from `chart-1…6` in order; income/expense comparisons use `income` / `expense` tokens.
- Always label axes with formatted currency; start bars at zero; include a legend only with ≥ 2 series.
- No 3D, no gradients, no animation on load beyond Recharts' default (disabled when reduced motion is set).

## 11. Components

### Catalogue

| Need | Component | Location |
|---|---|---|
| Actions | `Button` (variants `default` · `secondary` · `outline` · `ghost` · `link` · `destructive`; sizes `sm` · `default` · `lg` · `icon`; `loading`, `disabled`, `asChild`) | `ui/button.tsx` |
| Text input | `Input`, `Textarea` | `ui/input.tsx`, `ui/textarea.tsx` |
| Choice | `Select` (+ `SelectTrigger`, `SelectContent`, `SelectItem`, …) | `ui/select.tsx` |
| Date | `DateInput` | `ui/date-input.tsx` |
| Field wrapper | `FormField` — label, description, error, wires `aria-describedby` / `aria-invalid` | `shared/form-field.tsx` |
| Modal | `Dialog`, `Sheet` (side panels, phone "More") | `ui/dialog.tsx`, `ui/sheet.tsx` |
| Confirmation | `ConfirmDialog` (async-aware, pending state) on `AlertDialog` | `shared/confirm-dialog.tsx` |
| Menu | `DropdownMenu` (item variant `destructive`) | `ui/dropdown-menu.tsx` |
| Views | `Tabs` | `ui/tabs.tsx` |
| Data | `Table` (scrolls horizontally inside its container) | `ui/table.tsx` |
| Surfaces | `Card` (+ header, title, description, action, content, footer) | `ui/card.tsx` |
| Status | `Badge` (`income` · `expense` · `transfer` · `success` · `warning` · `danger` · `info` · neutral variants), `Alert` (`info` · `success` · `warning` · `destructive`) | `ui/badge.tsx`, `ui/alert.tsx` |
| Hints | `Tooltip` (supplementary only — never the sole source of information) | `ui/tooltip.tsx` |
| Feedback | `toast()` from `sonner`; host `Toaster` mounted in the root layout | `ui/sonner.tsx` |
| Loading | `Skeleton` | `ui/skeleton.tsx` |
| Empty / error | `EmptyState`, `ErrorState` | `shared/` |
| Money | `Money` | `shared/money.tsx` |
| Placeholders | `PlannedFeature`, `ModulePlaceholder` | `shared/`, `layout/` |
| Page frame | `AppShell`, `AppSidebar`, `MobileNav`, `AppHeader`, `PageContainer`, `PageHeader` (with breadcrumbs), `Breadcrumb` | `layout/`, `ui/breadcrumb.tsx` |

### Conventions

- `src/components/ui/` — shadcn/ui primitives (new-york style, Radix base), adapted to our tokens (`bg-card` on controls, `shadow-md` on popovers, `destructive-muted` for danger fills). Add new ones with `npx shadcn@latest add <name>` when `ui.shadcn.com` is reachable, otherwise by hand from shadcn's source; then adapt to tokens. No business logic.
- `src/components/shared/` — cross-module building blocks. `src/components/layout/` — the shell and page frame; `navigation.ts` is the single list of modules.
- `src/features/<module>/components/` — module UI. Server components by default; `"use client"` only for interactivity, kept small and leaf-level.
- File names are kebab-case (`confirm-dialog.tsx`), matching shadcn; exported components are PascalCase. Props use an explicit `interface`.
- Every interactive component must work with keyboard only and expose an accessible name; this is verified on the design-system page by e2e tests.

## 12. Copy

Sentence case everywhere ("Add expense", not "Add Expense"). Short, friendly, specific. Use "you/your". Numbers formatted, never raw. Avoid exclamation marks except for genuine achievements ("Goal reached!").
