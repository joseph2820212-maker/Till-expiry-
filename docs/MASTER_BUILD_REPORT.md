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
