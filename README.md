# TillExpiry

Till Note family app: keeps track of use-by and best-before dates on the shelf. Scan a product, add its date, and
see what is expired, due today and due soon; walk the shelves with the daily date check; record what was reduced,
sold or thrown away. Offline, no account, six languages (English, Arabic, Turkish, French, Spanish, German).

Status: **Release 1 source build complete** (`docs/gates/BUILD/REPORT.md`). Built on the family shell from
TillLabel `8f31e88` (itself from TillCalc `e7ea8ca`); what was reused and what is new is in
`docs/REUSE_MANIFEST.md`. Scope, the provisional Free / Pro split and the owner decisions still open are in
`docs/SCOPE_LOCK.md`.

## What it does

| Tab | Purpose |
|---|---|
| Today | Expired / due today / due soon counts, the date check, scan to add a date, the next dates to deal with |
| Dates | Every open date grouped Expired → Today → Soon → Later; filters, search, CSV export |
| Products | Product list with each product's next date; add, scan, import CSV |
| Menu | Language, currency, dates & reminders, backup, date check, history & waste, import, Pro, help, legal |

## Checks

```
npm ci
npm run typecheck && npm run lint && npm test -- --runInBand
```

Build and release steps: `docs/RELEASE_RECIPE.md`.
