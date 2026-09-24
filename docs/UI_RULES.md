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
4. **Result cards are full-width and show one number per line.** The `ResultCard` component
   (label + status chip / one large number / one sentence) is the only pattern for answer + meaning.
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

## TillExpiry additions

- **Dates are calendar dates** (`YYYY-MM-DD`, device-local). Day maths runs on UTC day numbers
  (`src/domain/dates.ts`), so time zones and daylight saving never move a date.
- **One band per date, everywhere**: `bandFor()` decides expired / today / soon / later for the Today tiles,
  the Dates list, the date check, the check sheet, the CSV export and the reminders.
- **Band colours**: expired = danger red, today = amber, soon = navy, later = green (`BAND_STYLE`). Colour is never
  the only signal: every row also carries the words ("Expired yesterday", "In 3 days").
- **Counts are neutral** ("Left: 3", "Warning days: 1"), never "1 days": the family does not use plural forms.
- **Best before is worded differently** from use by once past ("Past best before"); the app never says what may be
  sold – that is the shop's local rule.
- **Chips wrap** (rule 5): filters, date kinds, quick dates and times are wrapping `FilterChip` rows.
