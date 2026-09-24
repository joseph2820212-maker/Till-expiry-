# Reuse manifest

Sources, inventoried read-only on 24 Sep 2026: TillLabel `8f31e88` (TL), which carries TillCalc `e7ea8ca` (TC) and
the Till Note (`d5bc87b`, TN) legal / help structure. TillExpiry started as a copy of TL's tree (no `.git`, no
`node_modules`, no docs), then removed everything label-specific and added the date domain.

## 1. Reused unchanged (with their tests)

| Area | Files | Tests carried |
|---|---|---|
| Shared components | `src/components/*` (AppButton, AppShared, AppAlert(+Overlay), keyboard views and sheets, AppSwitch, AppTextInput, InputField, DropdownField, PickerSheet, OtherInputModal, CheckboxRow, RadioRow, FilterChip, ToggleSegment, DatePickerField, ScreenHeader, TabRootHeader, EmptyState, LabelRow, HeaderTopBleed, DemoBackArrow, ErrorBoundary, DocBlocks, AmountText, BackupPassphraseModal, settings rows) | `components/__tests__/*` |
| Theme, hooks | `src/theme/*`, `src/hooks/*` | `colorRegression` (screen list updated), `useResponsive` |
| Storage safety | `utils/storageSafety.ts`, `storage/repo.ts` (strict read-modify-write, multi-key transactions with rollback) | `storageSafety` |
| Files, CSV, PDF | `storage/fileUtils.ts`, `utils/csv.ts` (formula-injection guard), `utils/csvFile.ts`, `utils/pdfFile.ts`, `utils/htmlEscape.ts`, `utils/base64.ts` (UTF-8 / Windows-1252) | their tests |
| Money | `domain/money.ts`, `domain/typedPrice.ts`, `domain/formatMoney.ts`, `utils/currency.ts` (no default currency), `utils/currencyUnits.ts` | `money`, `typedPrice`, `formatMoney`, `currency`, `noCurrencyDefault` |
| Barcodes, ids, scan bus, CSV cells | `products/utils/*` | `reusedUtils` (scan target renamed) |
| Crypto | `backup/backupCrypto.ts` (AES-256-GCM + scrypt; protected) | `backupCrypto` |
| Billing | `modules/billing/*` except `limits.ts` | `billingHardening`, `billingService`, `freeLimitSheet` |
| i18n engine, locale tooling | `src/i18n.ts`, `scripts/addLocaleKeys.mjs`, `scripts/genOssLicenses.mjs` | `localeKeyParity` |
| More / legal / help / about / support screens | `modules/more/*` | `legalParity`, `content`, `supportMail`, `settingsScreens`, `settingsValidation`, `moreScreenSilentAction` |
| Navigation shell (one stack per tab, tab bar always visible) | `src/navigation/*` | `persistentTabBar`, `navigationCompat` |

## 2. Adapted

| Area | Change |
|---|---|
| Identity | `TillExpiry`, `com.tillexpiry.app`, v0.1.0; camera text and native locales rewritten; `POST_NOTIFICATIONS` added, `RECORD_AUDIO` blocked |
| Storage keys | `TE_KEYS`; backup namespaces `settings`, `products`, `dates`; `app:reminderIds` is device-only |
| Backup | format `tillexpiry`, counts (products, dates on the shelf, closed dates); reminders rescheduled after restore |
| Billing limits | provisional Free / Pro split (`SCOPE_LOCK.md` §4) |
| Product store | same barcode rules and transactions; label fields and the print queue removed; date defaults, shelf life, warning days and an optional price added |
| Scan screen | modes `find`, `addDate`, `attach`, `attachDate` |
| Help, legal, about, privacy wording | rewritten for dates; Till Note section structure kept (parity test), plus a notifications line in the privacy policy and a food-rules sentence in the terms |
| Guard tests | screen lists, app name, tab names, button keys and locale prefixes updated |

## 3. New in TillExpiry

`domain/dates.ts`, `domain/expiry.ts`, `modules/dates/*` (store, hook, row, Dates / Add date / Date / Date check
screens), `modules/reports/*`, `modules/import/*` (CSV products and dates), `modules/reminders/*`,
`modules/settings/*`, `storage/changeBus.ts`, `utils/displayMoney.ts`, the Today screen, and their tests.

## 4. Removed (TL code with no TillExpiry role)

Label engine, fonts and barcode drawing (`bwip-js`), print queue, print jobs, stationery and calibration, offers and
reductions labels, Quick label, XLSX reader (`fflate`), TillCalc price-change import, in-app PDF viewer
(`react-native-pdf`, `react-native-blob-util`, the pdfium plugin and `android-libs`), `react-native-webview`,
`metro.config.js` (only needed for `bwip-js`).
