# Scope lock — TillExpiry Release 1

Source: owner request (24 Sep 2026) "build the Till Expiry app from A to Z; first study all the repos in the Till
Note family", read against Till Note (`PrivateBusinessVault_Master_v10_2` @ `d5bc87b`), TillCalc (`e7ea8ca`) and
TillLabel (`8f31e88`). A requirement may not be dropped silently. Changes are recorded in §5 with their effect.

## 0. Product definition

TillExpiry Release 1 is a **six-language international app** for shops and small food businesses that need to know
what goes out of date, and when. It records the dates the shop enters; it does not read packs by itself, does not
connect to a till and never decides what may legally be sold.

**Independent settings.** Changing one never silently changes another:

| # | Setting | Where it lives | Notes |
|---|---|---|---|
| 1 | App language | i18n (`app:language`) | UI, notification text, CSV headers and the check sheet |
| 2 | Currency | `settings:currency` (ISO 4217, **unset until chosen**) | Only for optional product prices and reductions; each price keeps its own currency; nothing is converted |
| 3 | "Due soon" window | `settings:expiry.alertDays` (default 3) | A product may override it (`Product.alertDays`) |
| 4 | Usual date kind | `settings:expiry.defaultDateType` (default best before) | A product may override it |
| 5 | Daily reminder | `settings:expiry.reminder` (off by default) | Local notifications only; permission asked only when turned on |

**Date kinds** are kept apart — use by, best before, sell by, display until — because many countries treat use by
as a safety date and best before as a quality date. The rules are the shop's own; the app only words them
differently ("Expired" vs "Past best before") and orders use-by dates first on the same day.

## 1. Included (Release 1)

| ID | Requirement | Where | Tests |
|---|---|---|---|
| E-01 | Products: name, barcodes (UPC-A = EAN-13, check digit checked, never rewritten), SKU, place, category, usual date kind, usual shelf life, own warning days, optional normal price; archive (never delete) | `products/*` | `dates/__tests__/stores.test.ts` |
| E-02 | Dates on the shelf: product + date + kind, optional count, place, note; the same product/date/kind is topped up, not duplicated; a new product is created in the same transaction as its first date | `dates/storage/batchStore.ts` | `stores.test.ts`, `screens.test.tsx` |
| E-03 | Bands expired / today / soon / later from one function, used by every screen, export and reminder | `domain/expiry.ts` | `datesExpiry.test.ts` |
| E-04 | Scan to add a date (camera stays open for the next product), scan to find, typed codes, torch | `products/screens/ScanScreen.tsx` | navigation walk |
| E-05 | Quick date entry: calendar (years ahead), usual shelf life, tomorrow, +3 days, +1 week, end of month; past dates saved with a warning | `AddDateScreen.tsx` | `screens.test.tsx` |
| E-06 | Daily date check: everything expired / due, oldest first; one-tap Fine / Sold out / Thrown away; "all the rest are fine" | `DateCheckScreen.tsx` | `screens.test.tsx` |
| E-07 | Reduce / sell / throw away / return / donate, partial or all; exact money for reductions (25 / 50 / 75 % half-up to the minor unit); undo the last action; delete only a mistaken entry | `DateDetailScreen.tsx`, `domain/expiry.ts` | `stores.test.ts`, `datesExpiry.test.ts` |
| E-08 | History & waste report per 7 / 30 / 90 days / all: units and value per currency, waste reasons, reductions that sold, most wasted products | `reports/*` | `reports.test.ts` |
| E-09 | CSV import of products and dates: six-language column guessing, date order chosen by the user (never guessed), preview, all-or-nothing commit that refuses if the list changed | `import/*` | `csvImport.test.ts` |
| E-10 | Exports: open dates CSV, full history CSV, printable A4 date-check sheet (PDF, grouped by place, RTL for Arabic) | `reports/exports.ts` | `reports.test.ts` |
| E-11 | Daily local reminder: one notification per day for the next 7 days with that morning's counts; only on days with something due; rebuilt on every change and every start | `reminders/*` | `reminders.test.ts` |
| E-12 | Encrypted backup / restore of products, dates and settings; reminders rescheduled after a restore | `backup/*` | `backupFile.test.ts`, `backupScreen.test.tsx` |
| E-13 | Lifetime Pro framework; review build unlocked | `billing/*` | billing tests |
| E-14 | Six languages, RTL Arabic, help (11 guide chapters, 8 FAQ chapters), legal parity with Till Note, support | `locales/*`, `more/*` | locale, legal, navigation-walk tests |

## 2. Excluded

EPOS / till integration; stock and ordering; reading dates from packs by camera (OCR); cloud sync or multi-user;
push notifications from a server; label printing (TillLabel does that); temperature logs and HACCP records;
country-specific legal advice; iOS build and TestFlight (later).

## 3. Model rules

- A product and a date are separate records. What happens to a date is appended as events; the shelf list, the
  history and the report are built from the same records.
- A closed date is history. Undo re-opens it; delete is only for a mistaken entry and leaves no history.
- Money is exact: integer minor units plus currency exponent; values in the report are never added across currencies.
- Dates are local calendar dates; day maths never goes through a time zone.
- Nothing is sent to a server. Reminders are scheduled on the device.

## 4. Commercial settings — PROVISIONAL, owner to confirm

Lifetime purchase only, as in TillCalc and TillLabel; the store price is set in the stores and RevenueCat, not in code.
The split below is a proposal pinned in `src/modules/billing/limits.ts` and guarded by `limitGate.test.ts`.

| Free | Pro (lifetime) |
|---|---|
| Up to 100 products (unlimited dates) | Unlimited products |
| Scan, add, check, reduce / sell / waste, undo | Waste & reduction report |
| Daily reminders | Full history CSV export |
| CSV import, open-dates CSV export | Printable date-check sheet (PDF) |
| Backup and restore, all six languages | |
| Existing data is never locked | |

## 5. Owner decisions and changes

| Date | Decision | Effect |
|---|---|---|
| 24 Sep 2026 | Build TillExpiry from A to Z after studying the family | This build; shell from TillLabel `8f31e88` |
| 24 Sep 2026 | Work happens on branch `claude/till-expiry-app-e7267q` of `Till-expiry-` | Session instruction |
| — | **Open:** Free product limit (100 proposed) and the Pro feature list | `billing/limits.ts` |
| — | **Open:** UK launch price for the lifetime unlock (TillLabel: £14.99) | Store listing only |
| — | **Open:** reference phone for device tests (TillLabel: Samsung Galaxy S22) | `docs/gates/BUILD/REPORT.md` |
| — | **Open:** TillLabel hand-off (reduced-to-clear labels from a reduced date) — a later family feature | Not in Release 1 |
