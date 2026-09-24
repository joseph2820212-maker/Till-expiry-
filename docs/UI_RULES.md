# TillExpiry UI rules — six languages, one layout

> Carried over from TillCalc via TillLabel (family shell). Calculator examples stay as layout illustrations; the rules
> themselves apply unchanged. Printed files (CSV, the date-check PDF) are not app chrome.

## Layout

1. **Stack vertically by default.** Two-column rows are allowed only for a pair of short numeric fields
   (`Case cost` / `Units per case`). Anything with a sentence, a hint, a long label or a long number
   (8+ characters including the currency symbol) gets its own full-width row.
2. **Cards hug their content.** Never fix the height of a container that holds text.
3. **Buttons are full-width, one per row.** English labels are at most three words; `AppButton`
   shrinks to 75 % when a translation is longer.
4. **Status cards are full-width**: `BatchCard` shows product, date meaning + deadline, one meta line, the status
   chip and at most one primary action.
5. **Chips wrap** (`flexWrap: 'wrap'`); never hide options behind a horizontal scroll.
6. **Tables become stacked rows** on phones (label above value). Three side-by-side cells are allowed
   only when each cell is a short number (the repricing review card).
7. **Inputs** are `InputField` (50 dp, label above, `numberOfLines={2}`); numeric inputs stay LTR in RTL.
8. **Forms** scroll inside `AppKeyboardScrollView`; **sheets** are `AppKeyboardBottomSheet`.
9. **Headers** use `ScreenHeader`: at most one primary icon plus the overflow `⋯`; every other action
   lives in a labelled sheet.

## Text

10. Every new string is added to **all six** locale files in the same commit; the parity test fails otherwise.
11. Keep DE/FR under ~1.4× the English length; prefer nouns over full sentences in labels.
12. Never concatenate sentence fragments — use i18n interpolation (`{{value}}`).
13. Numbers use `numberFontFamily()` (tabular figures); sizes come from `typography` tokens only.
14. Alerts use `AppAlert`, never `Alert.alert`.

## RTL (Arabic)

15. Label-left / value-right rows are built as `flexDirection: 'row'` with `I18nManager.isRTL` handled the
    way `PricingResultScreen.ResultRow` does; use logical `marginStart` / `marginEnd`.
16. Chevrons and back arrows flip (`DemoBackArrow`); progress and "→" glyphs in copy are avoided in
    favour of words.
17. PDF templates set `dir="rtl"` for Arabic.

## Money and figures

18. Money is rounded and displayed in the currency's minor unit (0, 2 or 3 decimals).
19. Per-product results are called **contribution**, **margin %** and **markup %**; **break-even** is
    reserved for the fixed-cost calculator; nothing at product level is called net profit.
20. No external rates, thresholds or benchmarks anywhere; targets are always the user's own.

## Family additions (from TillLabel)

- **Tab roots** use `TabRootHeader` (navy header, title + optional one-line subtitle). Pushed screens use
  `ScreenHeader` with Back. The bottom tab bar is visible on every screen (one stack per tab).
- **Empty states** use `EmptyState` (icon, title, one sentence) and appear only when the list really is empty.
- **Money** is shown from exact minor units (`src/domain/money.ts`), never from a float.

## TillExpiry additions (master handoff v1.0)

- **Tab roots** use `WorkspaceHeader` (title, search, the active business with its switcher; the DEMO tag in the
  demo). No settings icon in headers — settings live in More only. Pushed screens use `ScreenHeader` with Back.
- **The tab bar stays visible**; only the camera scanner and the native PDF preview hide it (`FULL_SCREEN`).
- **One wording source**: `src/modules/batches/format.ts` names every date kind and status. Nothing is ever called
  "safe"; unknown dates are "Needs checking" and never green; past use-by says "action required", past best-before
  says "review quality", past internal cutoff says "follow your procedure".
- **Status colours** (`statusColors`): past hard deadline = danger red, due today / urgent = amber, soon = navy tint,
  later = green tint, needs checking = grey, quality dates = purple tint. Colour is never the only signal.
- **Dates keep their precision**: a month-only best-before is shown as "Best before end September 2026", never as a
  day; exact-time deadlines show the time in the workspace time zone.
- **Counts are neutral** ("Left: 3", "Items: 12"): the family does not use plural forms.
- **Numeric fields** (`Field ltr`) stay left-to-right in Arabic (T62).
- **Lists that can grow** (Items, queue, search, history, import rows) are virtualised `FlatList`s.
- **Every save / action button** guards against double taps and passes a request id to the store.
