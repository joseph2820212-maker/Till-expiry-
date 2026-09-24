# TillExpiry — Release recipe

How to turn this branch into the installable **review APK** (master handoff §29, G10). Everything that can run without
an Android SDK was run in the build sandbox; the native compile could not, because the sandbox's network policy blocks
`dl.google.com` (Android SDK / NDK downloads) — see the G10 section of `MASTER_BUILD_REPORT.md`.

Branch: `claude/till-expiry-app-e7267q` · Expo SDK ~54.0.36 · React Native 0.81.5 · Node 22 · TypeScript strict ·
package `com.tillexpiry.app` · version 0.1.0 · versionCode 1 · `allowBackup: false` · OTA updates disabled.

## 0. Checks that must be green before any build

| Check | Command |
|---|---|
| Types | `npm run typecheck` |
| Lint (zero warnings) | `npm run lint` |
| Tests (T01–T68, navigation walk in six languages) | `npm test` |
| Expo config resolves with all plugins | `npx expo config --type introspect` |
| Release JS bundle builds | `npx expo export --platform android` |

## 1. Review APK — every feature unlocked, no billing

The review build has no billing code at all (decision D2): nothing to switch on or off. About shows "Review Build".

### Path A — local Gradle build (Android Studio machine)

Prerequisites: JDK 17, Android SDK platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, `ANDROID_HOME` set.

```bash
git clone https://github.com/joseph2820212-maker/Till-expiry-.git tillexpiry && cd tillexpiry
git checkout claude/till-expiry-app-e7267q
npm ci
npm run typecheck && npm run lint && npm test
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Without a release keystore the Expo template signs `assembleRelease` with the debug keystore. That is acceptable for a
private review APK only; record the fingerprint:

```bash
sha256sum android/app/build/outputs/apk/release/app-release.apk
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk
```

### Path B — EAS build (no local SDK)

```bash
npm i -g eas-cli && eas login
eas init                     # writes extra.eas.projectId into app.json — commit it
eas build -p android --profile preview    # distribution: internal → an APK
```

## 2. What to record for G10 (fill in `MASTER_BUILD_REPORT.md`)

Commit SHA · app version / versionCode · APK SHA-256 · signing certificate SHA-256 · test totals (`npm test` summary) ·
the exact build command · device checklist results (`docs/DEVICE_CHECKLIST.md`) · known limitations.

## 3. Not in this build

No store upload, no production billing product, no backend, no analytics, no cloud (§39). A store build needs its own
billing decision, legal text review and a release keystore; none of that is part of the review APK.
