# Dependency decisions

TillExpiry starts from TillLabel's lockfile (Expo SDK 54, no SDK upgrade) and changes only what its scope needs.

| Need | Decision | Version / licence | Reason | Rejected alternative |
|---|---|---|---|---|
| Daily reminders | **Added `expo-notifications`**, local notifications only | ~0.32.17 · MIT | The SDK 54 line; schedules date-triggered local notifications with an Android channel; no server, no push token. | A background task that computes counts at fire time (not reliable on Android without a foreground service); push notifications (needs a server and an account). |
| Date maths | In-repo `domain/dates.ts` on UTC day numbers | — | Five small functions; no time-zone library needed for calendar dates. | `date-fns` / `dayjs` (a dependency for what is a few lines). |
| CSV import | Reuse the family `parseCsv` + `detectDelimiter` + `decodeText` | in-repo | Already handles quotes, BOM, `;` / tab and Windows-1252. | — |
| XLSX import | **Not in Release 1**; the import screen asks for "Save as CSV" | — | Keeps `fflate` and the OOXML reader out; the family CSV path covers till exports. | Carrying TillLabel's XLSX reader. |
| Label engine, barcodes, in-app PDF viewer | **Removed**: `bwip-js`, `fflate`, `react-native-pdf`, `react-native-blob-util`, their config plugins, `@expo-google-fonts/ibm-plex-sans`, `react-native-webview`, `android-libs`, `plugins/pdfiumAndroidVersion.js`, `metro.config.js` | — | TillExpiry prints nothing on labels; the only PDF (the check sheet) is shared, not previewed in-app. | — |

No analytics, crash-reporting or network SDK is added. The licence inventory was regenerated with
`node scripts/genOssLicenses.mjs` in the same change (604 packages).
