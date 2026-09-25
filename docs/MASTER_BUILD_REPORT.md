# TillExpiry — master build report

One section per gate (master handoff §38). Status vocabulary: PASS · HOLD · FAIL · NOT TESTED. No percentage scores.
Automated tests are not device evidence; device items are tracked in `docs/DEVICE_CHECKLIST.md`.

## G0 — Baseline and reuse audit — PASS

| Field | Value |
|---|---|
| Starting SHA | `f6f4de8` (earlier TillExpiry source build on this branch) |
| Ending SHA | see git log: commit "G0: baseline, provenance generator and control documents" |
| Environment | Linux · Node 22.22.2 · npm 10.9.7 · Expo CLI 54.0.27 · Expo SDK ~54.0.36 · React Native 0.81.5 · TypeScript ~5.9 · Jest 29 · OpenJDK present · no Android SDK |

Requirements completed:

- Pinned references verified: TillCalc `e7ea8caa…` (commit object present, on `origin/main`); Till Note `6fa6e941…`
  (fetched `codex/till-note-visual-correction`, commit "Apply red-marked UI-only repairs", 15 Sep 2026).
- Required TillCalc files inspected (theme, components, PDF preview / CSV preview, price-list CSV and barcode code,
  `safeMarkdown`, backup, crypto, storage safety, i18n, locales, UI rules, release recipe).
- Required Till Note files inspected at `6fa6e941`: notification reconciliation (permission_required / schedule_failed
  states, cancel-before-replace, recovery marker), global shop switcher (listener pattern), global search helpers
  (active-shop-only, strict typed reads), demo async storage (prefix redirection, generations), backup schema.
- No source repository modified (`git status` clean in all three reference clones; reads via `git show` only).
- Provenance generator `scripts/genProvenance.mjs` added; at G0: 75 files byte-identical to TillCalc, 25 adapted from
  TillCalc, 21 via TillLabel, 21 new. The final table is regenerated at G9.
- Control documents created: `STATE.md`, `REUSE_PROVENANCE.md` (generated), `MASTER_BUILD_REPORT.md`, `DEVICE_CHECKLIST.md`.
  Earlier per-topic docs (scope lock, reuse manifest, screen register, dependency decisions, gate report) folded in here.
- The app boots: typecheck, lint and the existing 390 tests were green at the starting SHA.

Deviations: branch name (see `STATE.md`); the repository already existed with an earlier TillExpiry build, so G0 starts
from it instead of an empty project (decision D1).

Untested: nothing device-related at this gate. Next gate: G1.

## G1 — Foundation: identity, dependencies, five tabs, i18n shell — PASS

| Field | Value |
|---|---|
| Starting SHA | `f5ad94e` |
| Ending SHA | `28ea562` (committed together with G2) |

- Identity kept: TillExpiry · slug `tillexpiry` · `com.tillexpiry.app` · 0.1.0 / versionCode 1 · light UI · `allowBackup: false` · updates disabled.
- Billing SDK (`react-native-purchases`) and every billing module removed (D2). About shows "Review Build · All features unlocked · no purchases".
- TillCalc native PDF preview restored byte-identical from `e7ea8caa` (`AppPdfPreviewScreen`, `CsvPreviewModal`, `pdfPageSizes`, `react-native-pdf` + `react-native-blob-util` with their config plugins and the pdfium Android version plugin).
- Five tabs Today · Items · Add · Reports · More, one native stack per tab; every other screen registered in each tab's stack (`sharedScreens.tsx`), so the bar stays visible; only the scanner and native PDF preview hide it (T64).
- Start-up: interrupted restore recovery → language → journal recovery → scope → active workspace → settings → reminders (background).

## G2 — Storage and domain engine — PASS

| Field | Value |
|---|---|
| Starting SHA | `f5ad94e` · Ending SHA `28ea562` |

- `src/domain/expiry/*`: date precision (date / month / datetime, workspace time zone, DST-safe `zonedTimeToInstant`), validation (use-by never month-only), rule snapshots, deadline engine (earlier original hard date wins; original best-before kept as secondary quality date; moving never extends), status engine (unknown / later / soon / urgent / due_today / past_deadline + four quality statuses; nothing is ever "safe"), ranking.
- `src/domain/quantity`: thousandths arithmetic, never below zero.
- Storage: one record per key + per-workspace indexes, journaled transactions with a global lock and start-up rollback, strict reads on write paths, `demo:` scope prefix.
- Stores: workspaces, products, locations, rules (versioned), business lists, batches (create / open part / prepare / used / sold / wasted / returned / check / move / correct deadline / correct quantity / apply rule / label printed / archive), append-only events, idempotent request ids, settings.
- Tests: T01–T28, T31 (engine + store suites).

## G3–G8 — Screens, flows, barcodes, CSV, labels, reminders, search, reports, backup, demo — PASS (automated) / device NOT TESTED

| Field | Value |
|---|---|
| Starting SHA | `28ea562` |
| Ending SHA | see the G9 commit ("G9: audit …") |

Built in parallel work streams on the same branch, each with its own tests; the lead integrated, translated and verified.

- **Screen register E01–E44**: 43 screen files + sheets (E24 action sheet, markdown helper, removal sheet, workspace switcher, filters).
  Onboarding (Welcome / ChooseMode / WorkspaceSetup, E04 reminder intro card on Today) · Today, ExpiryQueue, CheckRound, GlobalSearch ·
  Items (dated items / products, filters, virtualised), ProductDetail, ProductEdit, BatchDetail + actions, BatchHistory · AddChoice,
  BarcodeScanner, AddBoughtIn, AddOpened, AddPrepared, AddOtherDated · RulesList, RuleEdit, LocationsList, LocationDetail ·
  DeadlineCorrection, MoveLocation · ReportsHome, ExpiryReport, WasteReport, ReportPreview · InternalLabelPreview · CsvImport,
  CsvImportPreview, DataExport, BackupRestore, RestorePreview · More, Workspaces, WorkspaceSettings, ReminderSettings,
  GeneralSettings, Language, Help, Legal, About, Offline & Private.
- **Barcodes (§11)**: a standard barcode only identifies the product; the date is always asked. GS1 AIs 01 (GTIN check digit), 10, 15, 17 parsed from symbology prefixes, GS separators and bracketed text; DD=00 → month precision; GS1 dates are a prefilled suggestion that must be confirmed (T32–T34).
- **CSV (§19)**: safe decode (BOM, UTF-8 / Windows-1252, `,` `;` tab, size / row caps, spreadsheet files refused), six-language header mapping, preview with per-row errors, duplicates and conflicts, one atomic transaction, SHA-256 fingerprint blocks a second import, same barcode + different lot/date stay distinct; export with formula-injection escaping and exact money (T35–T38).
- **Labels (§16)**: internal preparation label PDF with deadline, rule and its source, storage instruction; states it is not a legal PPDS label; marks "label printed" only after printing (T21).
- **Markdown helper (§17)**: exact integer money; never offered past a hard deadline, for an unknown date, or when a kept hard original date has passed (T57).
- **Reports (§18)**: expiry and waste reports; screen, CSV and PDF built from the same normalised rows; unknown cost stays unknown and totals are per currency (T29, T54–T56).
- **Reminders (§22)**: daily summary, advance, same-day and exact-time reminders; bounded plan (60); reconcile with permission_required / schedule_failed states; snooze never changes a date; demo never schedules; tapping a reminder opens the batch in its workspace (T09, T39–T45).
- **Search (§20)** active workspace only; deep links to product / batch / place / rule (T30, T67).
- **Workspaces (§21)**: several businesses, exactly one active, hide instead of delete, header switcher.
- **Backup (§23)**: `tillexpiry` v1, encrypted, exact key allowlist and record validation, preview, checked journal with rollback and launch recovery, TillCalc / Till Note / TillLabel files rejected, reminders cancelled and reconciled (T44, T46–T53).
- **Demo (§27)**: isolated under `demo:`; seed with a past use-by, due today, due soon, opened, prepared, no-date and quality items; reset never touches real keys; no assumed currency (T65–T66).

Failures found and fixed during integration (each with a regression test or an updated guard):
AppButton printed icon names as text → draws Ionicons; batch detail showed "Left: Left: 2" → `quantityValue`; demo hard-coded a currency → device currency or none (`noCurrencyDefault` test); price actions were allowed for unknown dates → `priceActionAllowed` tightened (markdown tests); Today's place chips scrolled sideways → wrap (UI rule 5); crash message claimed "Your data is safe" → neutral wording; stale v1 help / legal / privacy texts described a Pro purchase → rewritten for the review build (`privacyWording` test).

## G9 — Audit, locales, benchmarks — PASS

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean, zero warnings |
| `npm test` | 62 suites / 564 tests passed |
| Spec tests T01–T68 | every ID has at least one named test |
| Navigation walk | 50 screens (onboarding + tab roots + shared screens) × 6 languages: no throw, no raw key |
| Locale parity | 1,440 strings in each of en / ar / tr / fr / es / de; every key used by the source exists in all six |
| Scale | T67: 5,000 products indexed + searched; T68: 20,000 batches ranked + filtered (virtualised lists) |
| `npx expo config --type introspect` | resolves with all plugins |
| `npx expo export --platform android` | Hermes bundle `index-*.hbc` 6.79 MB |
| Network / analytics | no `fetch`, analytics, crash-reporting or billing code in `src/` |
| Dead code | 8 unused family / v1 files removed |
| Provenance | `docs/REUSE_PROVENANCE.md` regenerated: copied 83 · adapted 39 · reimplemented 8 · new 88 |

**Machine translations for human review (§4).** All ar / tr / fr / es / de strings added in G3–G9 (about 1,350 per
language: work screens, flows, reports, backup, CSV, help, legal, privacy) are machine translations and must be
reviewed by native speakers before any public release. Points the translators flagged:
- Legal / privacy / terms texts in all five languages (UK company terms rendered locally, "as is" clauses).
- German mixes the older informal "du" shell strings with the new formal "Sie" strings — pick one.
- Official date terms (use-by / best-before) per language, and month-only lines after the use-by label (FR "jusqu'au fin").
- Arabic numeral agreement in "{{count}} days" style strings; Turkish suffixes around placeholders.
- `errors.badMoney` examples use "1.25" in every language.

Not tested at this gate: anything on a real device.

## G10 — Review APK — HOLD

| Field | Value |
|---|---|
| Commit | the G9/G10 commit on `claude/till-expiry-app-e7267q` |
| Version | 0.1.0 · versionCode 1 · `com.tillexpiry.app` |
| APK | **not produced** |
| APK SHA-256 / signing fingerprint | — |
| Test totals | 62 suites / 564 tests passed |
| Build command (to run on a machine with the Android SDK) | see `docs/RELEASE_RECIPE.md` §1 |

Why HOLD (the §42 stop condition "the environment cannot build the APK"): this build environment's network policy
denies `dl.google.com` (403 on CONNECT), which serves the Android SDK platform 36, build-tools and NDK 27 that a
React Native 0.81 / Expo 54 release build needs; `api.expo.dev` (EAS) is denied as well. No other honest route to an
installable APK exists here (the Ubuntu archive only carries far older SDK platforms, and a hand-assembled SDK would
not be a trustworthy build). Everything short of the native compile was verified: typecheck, lint, all tests, config
introspection and the Android release JS bundle.

To finish G10: allow `dl.google.com` (and optionally `api.expo.dev`) in this environment's network settings, or run
`docs/RELEASE_RECIPE.md` §1 on any machine with Android Studio, then record the APK SHA-256, signing fingerprint and the
device checklist (`docs/DEVICE_CHECKLIST.md`, all rows NOT TESTED).

### Known limitations of this build
- No device evidence yet; automated render tests are not visual or device proof.
- GS1 DataMatrix group separators depend on the Android camera decoder (device check 10).
- Batch-level cost is not stored: costs come from the product; a CSV batch cost is used only when it creates the product.
- When cost / price of an existing product is changed inside the bought-in form, product and batch are two writes.
- The label prints as an A4 sheet of 86 mm labels, not a small label-printer size.
- The reminder preview on the add forms is computed from settings, not read back from the scheduled notifications.
- Tapping a notification opens the batch; the daily summary opens Today.
- Web preview (development only) shows English only; it is not a supported platform.

## Independent review remediation (review of `e056e93`, 25 Sep 2026) — fixes PASS (automated) · G9 HOLD until re-audit

| Field | Value |
|---|---|
| Reviewed SHA | `e056e93417b340d48fb5af7cf36c37fc5e8033ec` |
| Remediation commits | `794e393` (EXP-REV-01/02/06/07/08/09/10) · `3319919` + the final "review remediation" commit (EXP-REV-03/04/05, backup wording, translations, docs) |
| Scope | only the review findings; no redesign |

| Finding | Fix | Regression tests |
|---|---|---|
| EXP-REV-01 opened-child correction could drop the parent's earlier hard date | `correctDeadline` on an opened child re-derives through `openedDeadline` with the parent; the correction replaces only the child's own date; the correction screen edits the child's own date and links to the parent for pack-date corrections | batchStore: 26 Sep use-by vs 30 Sep cutoff; correction to none; best-before parent keeps quality secondary; history before/after/reason + idempotent |
| EXP-REV-02 product money edit and new batch were two writes | `DatedInput.productMoney` is applied inside the batch's journaled transaction | addFlows: injected write failure leaves product money, batches, events and indexes unchanged; repeat tap idempotent |
| EXP-REV-03 restore could report success, then roll back on launch | commit marker written and read back before success; otherwise immediate rollback (or `restoreUnconfirmed` with a deterministic launch outcome); cleanup failure after commit keeps the new data | backupFile "REV-03 durable commit point" block (6 cases) |
| EXP-REV-04 failed restore recovery was swallowed at start-up | `runStartupRecovery` → blocking `RecoveryRequiredScreen` with Retry; journal kept; unreadable `prepared` journal blocks instead of being discarded; new restores refused while a journal is pending | backupFile recovery cases, `recoveryRequiredScreen.test.tsx` |
| EXP-REV-05 backup silently dropped bad records | normal backup fails closed (`backupBlocked` + category names, no file, no share sheet); referential validation (index ↔ item, workspace ownership, orphan items, active workspace, per-batch event lists) on backup and restore | corrupt product, missing item, orphan item, broken event list, hidden active workspace, "no valid record disappears" |
| EXP-REV-06 currency change relabelled money | `updateWorkspace` refuses a currency change while products hold other-currency amounts (`currencyInUse`) unless the user explicitly clears them to unknown; forms never prefill or rewrite other-currency amounts | `currencyPolicy.test.ts` (4), addFlows GBP→EUR case |
| EXP-REV-07 exact reminders on Android 12+ | **Option B** (D9): reminders are best effort; `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM` are blocked (manifest `tools:node="remove"`); expo-notifications falls back to inexact alarms; wording states possible delay and that Today is authoritative | `reminderPolicy.test.ts` |
| EXP-REV-08 label_printed recorded when the Android print dialog merely opened | after `printAsync` the user is asked "Did the label print?"; only Yes records `label_printed` | reportScreens E31 (No records nothing, Yes records once) |
| EXP-REV-09 GS1 AI 17 DD=00 treated as month-only | AI 17 DD=00 → last calendar day (leap years); AI 15 keeps month precision; user confirmation unchanged | gs1: 2027-02-28, 2028-02-29, 2026-11-30, 2026-12-31 |
| EXP-REV-10 waste cost changed with later product cost | wasted events store `unitCost` snapshot; legacy events without it show unknown cost | reports: £1 snapshot survives change to £2; legacy → unknown |
| §4 share wording | `lastBackupPreparedAt`; "Backup file prepared — choose where to save it"; never "backup complete" from `shareAsync` | backupScreens wording cases |

Gates after remediation: `npm run typecheck` clean · `npm run lint` clean · `npm test` 65 suites / 602 tests passed ·
`npx expo config --type introspect` OK · `npx expo export --platform android` Hermes bundle 6.76 MB. 38 new strings
translated into ar / tr / fr / es / de (machine translation, for human review; German "erstellt" for a prepared file,
"Wiederherstellung" used for both recovery and restore — flagged).

Still required before release: independent re-audit of this SHA, then the native APK on a networked Android build
machine (G10 HOLD unchanged) and the device checklist, including the new rows 35–38.

## Re-audit remediation (re-audit of `ac4916d`) — fixes PASS (automated) · G9 HOLD until the final narrow re-audit

| Field | Value |
|---|---|
| Re-audited SHA | `ac4916ddd5bb5fd2edbb7892b6f612c0d3051916` |
| Remediation commit | the commit "Re-audit fixes P1-REOPEN-01/02, P2-01/02 …" (SHA returned with this pass) |
| Scope | only the re-audit findings; no redesign; no APK |

| Finding | Fix | Regression tests |
|---|---|---|
| P1-REOPEN-01 parent correction left opened children stale | `correctDeadline` on a pack re-derives every direct opened child (`openedDeadline` against the corrected parent, keeping the child's own date or rule) in the SAME transaction; each changed child gets a `deadline_corrected` event with before / after / `fromParent`; a child whose parent record is missing fails closed (`parentMissing`, also in `applyRule`) | batchStore: 30→26 child becomes 26; 26→30 child returns to its own 28; best-before correction updates the child secondary; rule-based child; injected failure rolls back parent + all children; Today / report / reminder inputs see the new date; missing parent fails closed |
| P1-REOPEN-02 an unsettled restore could be escaped with Back | global write gate (`src/storage/writeGate.ts`): `restoreUnconfirmed`, `rollbackFailed` and unresolved `recoveryRequired` close it at once; App.tsx then renders only `RecoveryRequiredScreen` (no Back, no header, no tabs) in place of the navigator; `runTxn`, settings saves and new restores refuse while it is closed; Retry = `settleRecovery`, which opens the gate only after recovery returns ready and the data is reloaded | backupFile: gate closes on unconfirmed; no business write (product, workspace, settings) possible and nothing changes on disk; Retry prepared → old dataset then writes allowed; Retry committed → new dataset kept; Retry that cannot settle keeps the gate and journal; restore screen shows no Back / failed state |
| P2-01 stale appliedRule after a manual correction | a manual correction removes `appliedRule` from the batch; the old snapshot is kept in the event's `before.appliedRule` | opened and prepared × direct and no-date corrections |
| P2-02 reminder wording promised "a few minutes" | wording now "Android may deliver this reminder later than the selected time. Open Today for the current status." in six languages; help text says best effort with no guaranteed time | `reminderPolicy.test.ts` checks best-effort / no-guarantee wording and that no delay window is promised |
| Backup validator hardening | batch `productId`, `parentBatchId`, `sourceBatchIds` must reference existing same-workspace records; batch own date fields, `effective` / `secondary` deadline structures (real dates / months / offset instants, use-by never month-only), batch and workspace time zones (IANA) are validated on backup and restore | allowlist/validation: unknown product, missing parent, missing source, bad zone, use-by without date, month-only use-by, 30 February, malformed own date, bad workspace zone |

Gates: `npm run typecheck` clean · `npm run lint` clean · `npm test` 65 suites / 619 tests passed ·
`npx expo config --type introspect` OK · `npx expo export --platform android` Hermes bundle 6.77 MB.
New strings (6) written in all six languages; for human review with the rest of the machine translations.
APK not built (G10 HOLD) — waiting for the final narrow re-audit, as instructed.
