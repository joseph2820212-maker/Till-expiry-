# TillExpiry — Release recipe

Structure carried over from TillCalc / TillLabel, regenerated with TillExpiry facts. Everything below was verified
in the build sandbox except the native compile, which needs an Android SDK. Run the steps in order on a machine with
normal internet access.

Branch: `claude/till-expiry-app-e7267q` · Expo SDK 54 · React Native 0.81.5 · Node 20 (CI) / 22 · TypeScript strict.

## 0. What is already proven in this repo

| Check | Result | Command |
|---|---|---|
| Types | clean | `npm run typecheck` |
| Lint | clean, zero warnings | `npm run lint` |
| Tests | 49 suites / 390 tests, including the navigation walk (19 routes × 6 languages) | `npm test` |
| Expo config resolves with all plugins (camera, notifications, document picker) | exit 0 | `npx expo config --type introspect` |
| Release JS bundle builds | `index-*.hbc` 7.1 MB | `npx expo export --platform android` |

Re-run the first three before every build. They must be green.

## 1. Review APK (everything unlocked) — the build the owner installs first

Built with the billing bypass so every Pro feature is testable without a store account.

### Path A — local Gradle build

Prerequisites: JDK 17, Android SDK platform 35, build-tools 35.0.0, NDK 27.1.12297006, `ANDROID_HOME` set.

```bash
git clone <repo> tillexpiry && cd tillexpiry && git checkout claude/till-expiry-app-e7267q
npm ci
npm run typecheck && npm run lint && npm test
EXPO_PUBLIC_BILLING_BYPASS=1 npx expo prebuild -p android --clean
cd android && EXPO_PUBLIC_BILLING_BYPASS=1 ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

`EXPO_PUBLIC_*` variables are inlined at JS bundle time, so set them for the command that bundles the JS.

### Path B — EAS build (no local SDK)

```bash
npm i -g eas-cli && eas login
eas init                    # writes extra.eas.projectId into app.json — commit it
EXPO_PUBLIC_BILLING_BYPASS=1 eas build -p android --profile preview
```

`preview` is `distribution: internal` (an APK); `production` produces an AAB for Play.

## 2. Store build (Pro gated by RevenueCat)

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_RC_ANDROID_KEY` / `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat public SDK keys |
| `EXPO_PUBLIC_RC_LIFETIME_ID_ANDROID` / `EXPO_PUBLIC_RC_LIFETIME_ID_IOS` | store product ids of the lifetime unlock |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | support address (default support@tillnote.com — same as Till Note) |
| `EXPO_PUBLIC_PRIVACY_EMAIL`, `EXPO_PUBLIC_LEGAL_EMAIL`, `EXPO_PUBLIC_SECURITY_EMAIL` | optional overrides |

Do **not** set `EXPO_PUBLIC_BILLING_BYPASS` for the store build. RevenueCat: entitlement `pro`, offering `default`,
one package `$rc_lifetime`. The app buys only that package (audit F07, carried over).

```bash
eas build -p android --profile production
eas build -p ios --profile production
```

Let EAS manage signing unless the owner already has a keystore; a lost keystore means a new package name.

## 3. Things to know

- `app.json`: `expo-camera` (barcode scanning; permission text in six native locales), `expo-notifications`
  (daily local reminders; `POST_NOTIFICATIONS` on Android 13+; the permission is asked only when the user turns
  reminders on), `expo-document-picker` (CSV import, backup restore), `android.allowBackup=false`,
  `RECORD_AUDIO` blocked. No push service, no FCM / APNs token is ever requested.
- Reminders are local: one scheduled notification per day for the next 7 days, rebuilt whenever dates change and on
  every start. Android battery optimisation can delay them; Help says so.
- OTA updates are disabled (`updates.enabled: false`) and the privacy policy says so.
- `ITSAppUsesNonExemptEncryption: false`: the only encryption is the standard AES-256-GCM / scrypt for the user's own
  backup files. The owner confirms Apple's export-compliance answer for their account.
- Analytics: none.
- The web preview (`expo export --platform web`) can show English only: `I18nManager` is not implemented on web.
  Language and RTL checks belong on a phone.

## 4. Store listing inputs (draft, for the owner)

- Name: **TillExpiry**. Subtitle: **Expiry dates, under control**.
- One-liner: *Scan it, date it, and see what runs out today — before it becomes waste.*
- Privacy line: *Your products and dates stay on your phone. No account, no tracking. Purchases go through your app store.*
- Free vs Pro copy: `billing.proSummary` in `src/locales/en.json`.

## 5. After the owner's device pass

Work through "READY FOR OWNER TEST" in `docs/gates/BUILD/REPORT.md`. Anything that fails there is a bug to fix
before the store build.
