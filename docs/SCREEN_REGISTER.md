# Screen register

Every route and its states. States: E = empty, L = loading, V = validation, P = populated, F = failure.
All routes are live and in the navigation walk (19 routes × 6 languages).

## Tab roots

| Route | Tab | Purpose | States |
|---|---|---|---|
| `Home` | Today | Expired / due today / due soon tiles (open the Dates tab filtered), date check card, scan to add, add a date, the next dates to deal with, set-up rows | E P F |
| `Dates` | Dates | Open dates grouped by band; filters (all, needs action, expired, today, soon, later, reduced); search; add, scan, CSV export | E L P F |
| `Products` | Products | Products with their next date and "+n more"; filters (all, with dates, no dates, archived); add, scan, import; add a date per row | E L P F |
| `More` | Menu | Language, currency, dates & reminders, backup; date check, history & waste, import; Pro; help, legal, about | P |

## Shared screens (registered in every tab's stack)

| Route | Purpose | States |
|---|---|---|
| `AddDate` | Add a date (product by search, scan or new name; date; kind; count; place; note) or correct one (`batchId`) | V P F |
| `DateDetail` | One date: band, advice when past, counts, actions (checked, reduce, sold, thrown away, returned / donated), correct, open product, undo, delete, history | L P V F |
| `DateCheck` | The daily walk with one-tap actions, "all the rest are fine", printable sheet (Pro) | E L P F |
| `Reports` | History & waste (Pro report, history CSV) and recently closed dates | E P F |
| `ProductDetail` | Add / edit a product and see its open and past dates; archive | V P F |
| `Scan` | Camera scan (explain before permission, torch, typed code), four modes | L P F |
| `Import` | CSV import: columns, date order, default kind, preview, all-or-nothing import | V P F |
| `SettingsDates` | Due-soon window, usual date kind, daily reminder and its time (permission explained first) | P F |
| `SettingsLanguage` | App language (six, RTL transition) | P F |
| `SettingsCurrency` | Shop currency (ISO code; never assumed) | P F |
| `SettingsBackup` | Encrypted backup and restore, data check | L P V F |
| `SettingsHelp` | Guide (11 chapters) and questions (8 chapters) | P |
| `SettingsLegal` | Privacy, terms, data-storage notice, licences | P |
| `SettingsAbout` | App description, contact and support | P |
| `SettingsOfflinePrivate` | Offline and privacy model | P |

## Guards

- `src/__tests__/navigationWalk.test.tsx` renders every route in six languages with seeded dates (no throw, no raw
  key) and fails if a registered route is missing from its map.
- `src/navigation/__tests__/persistentTabBar.test.ts` pins the four tabs and the 15 shared screens.
