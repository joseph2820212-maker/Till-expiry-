# TillExpiry — build state

Single live state file (master handoff §38). Updated at every gate.

| Field | Value |
|---|---|
| Specification | TillExpiry — Claude Code Master Build Handoff v1.0 (24 Sep 2026) |
| Repository | joseph2820212-maker/Till-expiry- |
| Branch | `claude/till-expiry-app-e7267q` (the session's mandated branch; the handoff names `claude/build-till-expiry-v1`, which this session is not permitted to push to — recorded as a deviation) |
| Primary reference | TillCalc `e7ea8caadd1b2f2e663b3c8059b4102d5515adcc` (verified present; on `origin/main` and `claude/audit-repair-release1`) |
| Secondary reference | Till Note `6fa6e941ac7e94334519c435f8bae3bf9d160826` on `codex/till-note-visual-correction` (verified present, 15 Sep 2026 "Apply red-marked UI-only repairs") |
| Current gate | G10 — HOLD (APK cannot be built in this environment; everything else PASS) |
| Blockers | G10 native build: `dl.google.com` (Android SDK / NDK) and `api.expo.dev` (EAS) are denied by this environment's network policy; see the G10 section of `MASTER_BUILD_REPORT.md` |
| Last verified | typecheck clean · lint clean · 62 suites / 564 tests · Android JS bundle exported |

## Decisions taken under §42 ("resolve routine implementation details yourself")

| # | Decision | Reason |
|---|---|---|
| D1 | Evolve the existing TillExpiry tree (TillCalc shell, via TillLabel) instead of re-copying TillCalc from scratch | The shell files are byte-identical to TillCalc `e7ea8ca` or traceable adaptations (provenance table); re-copying would reproduce them exactly |
| D2 | Billing SDK removed from the review build; every feature unlocked; "Review build" shown in About | §29 — billing must not delay the review APK; no network SDK in the review build (§34) |
| D3 | Demo data lives under its own `demo:` key namespace, adapted from Till Note's `demoAsyncStorage` redirection | §21, §27, T65–T66: demo can never read or write real keys |
| D4 | Markdown helper reimplemented in exact integer money from the idea of TillCalc `safeMarkdown.ts`, without its tax / fee pricing engine | TillExpiry keeps no tax or fee settings; the TillCalc helper depends on the locked float pricing engine |
| D5 | Currency is chosen per workspace (optional); the global currency screen was removed | §21: businesses can differ; no default currency |
| D6 | Batch cost is not stored separately; reports use the product's cost per unit and show unknown when missing | §7 data model; unknown cost stays unknown (§18) |
| D7 | Review build shows no purchase wording anywhere (help, legal, privacy rewritten) | §29; statements must be true for the build being reviewed |
| D8 | Demo never schedules notifications and never assumes a currency | §27 isolation; family no-default-currency rule |
