# Build report — TillExpiry Release 1 (source build)

Owner instruction (24 Sep 2026): build the Till Expiry app from A to Z, after studying every repository in the Till
Note family. This report covers the source build. Physical checks (phone, camera, notifications, printer) are listed
as **READY FOR OWNER TEST**, never as passed.

## 1. Family study (what was read and what it decided)

| Repo | What it contributed |
|---|---|
| Till Note (`PrivateBusinessVault_Master_v10_2` @ `d5bc87b`) | Publisher identity, legal / help / support document set and section order (parity-tested), backup design, the "Till family" look (navy / cream) |
| TillCalc (`tillcalc` @ `e7ea8ca`) | The shared shell: components, theme, i18n in six languages, storage safety, encrypted backup, lifetime Pro billing, scanning utilities, CI |
| TillLabel (`till-lable` @ `8f31e88`) | The most recent family build and the direct template: one stack per tab with a permanent tab bar, exact money, no default currency, product store with barcode rules, scanner screen, CSV decoding, docs structure (scope lock, reuse manifest, screen register, gate reports) |
| `till-count-` | Empty (no commits) — nothing to reuse |

## 2. What the app does now

| Area | Built | Key files |
|---|---|---|
| Today | Expired / due today / due soon tiles (tap → Dates filtered), date-check card with what is left to check today, scan to add, add a date, the next five dates to deal with, set-up rows | `home/screens/HomeScreen.tsx` |
| Dates | All open dates grouped Expired → Today → Soon → Later, oldest first and use-by first on the same day; filters incl. reduced; search by name, code or place; CSV export | `dates/screens/DatesScreen.tsx` |
| Add / correct a date | Product by search, scan or a new name (created with its first date in one transaction); calendar years ahead plus quick chips (usual shelf life, tomorrow, +3 days, +1 week, end of month); four date kinds; count, place, note; "save and add another"; same product + date + kind is topped up | `AddDateScreen.tsx`, `batchStore.ts` |
| Date | Band and plain-language advice when past (best before worded differently), counts, reduce (25 / 50 / 75 % exact), sold / thrown away (reason) / returned / donated — part or all, undo the last action, delete a mistaken entry, history | `DateDetailScreen.tsx` |
| Date check | Everything that needs action with one-tap Fine / Sold out / Thrown away, progress, "all the rest are fine", printable A4 check sheet grouped by place (Pro) | `DateCheckScreen.tsx`, `reports/exports.ts` |
| Products | List with each product's next date and "+n more"; product editor with usual date kind, usual shelf life, own warning days, optional price; open and past dates; archive | `products/screens/*` |
| Scanning | Four modes (find, add a date with the camera left open for the next product, attach to product, attach to date); explain-before-permission; torch; typed codes | `ScanScreen.tsx` |
| Import | CSV (`,` `;` tab; UTF-8 or Windows-1252); column guessing in six languages; the user chooses the date order (never guessed; ambiguous cells counted); preview of new / existing / dates / skipped with reasons; all-or-nothing commit that refuses if the product list changed; row limit reported | `import/*` |
| History & waste | Pro report per 7 / 30 / 90 days / all: thrown away, reduced, sold, returned, donated — units and exact value per currency, waste reasons, reductions that sold, most wasted products; history CSV (Pro); recently closed dates (free) | `reports/*` |
| Reminders | Daily local reminder at a chosen hour; one notification per day for 7 days with that morning's counts, only on days with something due; rebuilt on every change, language change and start; permission explained first, never asked at start-up | `reminders/*`, `settings/screens/DatesSettingsScreen.tsx` |
| Settings | Due-soon window, usual date kind, reminder and time; language; currency (unset until chosen) | `settings/*`, `more/*` |
| Backup | Encrypted (AES-256-GCM + scrypt) products, dates and settings; staged restore with rollback; reminders rescheduled after restore | `backup/*` |
| Help, legal, support | Guide (11 chapters), FAQ (family 5 + dates, reminders, plans); privacy (notifications line added), terms (food-rules responsibility sentence), data notice, licences (604 packages) | `more/content/*`, `locales/*` |
| Languages | 733 keys in each of English, Arabic, Turkish, French, Spanish and German; RTL Arabic; neutral count wording (no "1 days") | `src/locales/*`, `scripts/locale-keys/te-release1.json` |

## 3. Verification

```
npm run typecheck && npm run lint && npm test          # clean · clean · 49 suites / 390 tests
npx expo config --type introspect                      # exit 0 (camera, notifications, document picker)
npx expo export --platform android                     # Hermes bundle 7.1 MB
```

- **Navigation walk**: all 19 routes render in all six languages with seeded dates (expired, today, reduced, soon,
  later, closed with a reduction and waste): no crash, no raw key.
- **Domain tests**: calendar maths across month / year ends and both 2026 daylight-saving changes; ISO-only dates;
  confirmed-order parsing and ambiguity detection; bands with the window inclusive; product windows; attention order;
  remaining stock; exact percent and reduced prices (half-up, 0 / 2 / 3-decimal currencies); unsafe multiplication refused.
- **Store tests**: new product + first date in one transaction; top-up merge; bad input writes nothing; a failed
  write rolls both lists back; partial / full removals; closed dates refuse changes; undo re-opens; count cannot drop
  below what left; once-a-day checks; renaming a product renames open dates only; UPC-A = EAN-13 duplicates refused.
- **Import tests**: six-language headers; score-based guessing ("Shelf life days" is not the place column); dmy vs mdy;
  skipped-row reasons; barcode-first matching; re-import tops up; changed-list refusal; in-file barcode conflicts;
  row-limit counting.
- **Report / export tests**: values at the reduced price when reduced first, per currency, unvalued counted; CSV rows;
  check sheet escaped, grouped, RTL, empty state.
- **Reminder tests**: 7-day plan with per-day counts, empty days skipped, passed time skipped; nothing scheduled when off
  or without permission and no permission prompt from the sync; only TillExpiry's own notifications replaced or cancelled.
- **Screen tests**: scanned unknown barcode → name → date → saved; date check one-tap actions.
- **Visual check** (web export, 390 × 844, English): Today, Dates, Date, reduce sheet, Date check, Products, Product,
  Menu, Dates & reminders. Found and fixed: "1 days" / "1 units" wording (now neutral in six languages). The web
  preview cannot show other languages or right-to-left (`I18nManager` is not implemented on web), so those are part
  of the phone test below.

## 4. READY FOR OWNER TEST (needs a phone)

| Check | How |
|---|---|
| Install the review APK and walk every tab | `docs/RELEASE_RECIPE.md` §1 |
| Camera scanning of real products in shop light and in fridges (torch) | Today → Scan to add a date |
| Notification permission prompt appears only after "Continue"; reminder arrives at the chosen time; tapping it opens the app | Menu → Dates & reminders |
| Reminder with the battery saver on, and after a reboot | Leave the phone overnight |
| Share the dates CSV and history CSV; open them in Excel / Sheets (accents, Arabic) | Dates → Export; History & waste |
| Print the check sheet from the phone at A4 | Date check → Printable check sheet |
| Import a CSV exported from your till | Menu → Import from a file |
| Arabic right-to-left on the phone; Arabic / Turkish wording by a native reader | Menu → Language → العربية |
| Backup on one phone, restore on another; reminders come back | Menu → Backup & Restore |

## 5. Not built (by decision or outside this environment)

- XLSX import (CSV only in Release 1; `docs/DEPENDENCY_DECISIONS.md`).
- A TillLabel hand-off for reduced-to-clear labels (later family feature, `SCOPE_LOCK.md` §5).
- The APK itself and store listings (no Android SDK here; no store access).
- Owner decisions still open: Free limit and Pro list, launch price, reference phone (`SCOPE_LOCK.md` §4–5).
